# 麻將系統高擴充性架構指引 (Extensibility Architecture Guide)

這份文件總結了系統為了達到「無限擴充性」(支援從普通日麻到超能力麻將等複雜規則)，同時保持核心穩定與高效，所進行的架構方案評估與最終設計決策。

## 1. 核心設計理念與最終決策 (Core Philosophy & Decision)

基於效能、開發體驗與系統穩定度的平衡，系統採取以下核心架構：

1.  **前端 - 數據驅動 UI (Data-Driven UI)：**
    前端不再寫死任何特定的遊戲動作按鈕 (吃、碰、某個技能)。所有可執行動作皆由後端 Server 給予的 JSON 描述檔動態渲染，徹底解除前後端在擴充規則時的 UI 耦合。
2.  **後端規則引擎 - Stateless Runner + 狀態接納 Payload (首選)：**
    核心 Game Server 負責真實狀態，`function-runner` 負責執行玩家自定義腳本。兩者以 Stateless (無狀態) 方式透過 gRPC 溝通。腳本若需要記憶，由 Game Server 提供一塊 `customState` 負責保存並在下次調用時傳入。
3.  **效能優化 - Hook 註冊機制 (Hook Manifest) 與本地快取：**
    為了避免過度頻繁的 gRPC 呼叫，自定義腳本必須在遊戲初始化時宣告「監聽清單 (Manifest)」。同時 `function-runner` 必須具備 **本地腳本快取 (Local Code Cache)**，避免每次執行前都要重新拉取程式碼。
4.  **子系統設計 - 被動事件總線 (Event Sourcing)：**
    對於不阻礙遊戲核心流程的子系統（例如：成就解鎖、玩家行為數據分析），採用被動的非同步 Event Queue 模式處理。

---

## 2. 架構演進方案總覽 (Architecture Options Overview)

在確立最終方案前，我們評估了以下 5 種維度的解法：

### 方案 A: 狀態接納 (Context Payload) + Hook 註冊 (🏆 目前首選)

- **概念**：`function-runner` 保持「隨叫隨棄」的輕量設定，用 `customState` 物件把專屬狀態儲存在 Game Core 中。透過 Hook Manifest 讓 Core 知道何時才需要發起 gRPC 呼叫。
- **優勢**：隔離度高、Runner 容易水平擴展、不會因為單一 Runner 重啟導致該局遊戲狀態遺失。
- **劣勢**：必須精準控制 Payload 大小，否則序列化成本會吃掉效能。

### 方案 B: 長駐型沙盒 (Stateful Session VM) (⏳ 有限計畫選項)

- **概念**：遊戲開始時在 `function-runner` 起一個長駐的 QuickJS / Sandbox 實例，靠 Bi-directional gRPC stream 維持整場遊戲的通訊。
- **優勢**：可以讓腳本直接寫 `let mp = 100; setInterval()` 等有狀態邏輯，不用一直把 Context 傳來傳去。
- **劣勢**：佔用大量記憶體、有 Runner 崩潰導致整局全毀的單點故障風險。未來視需求可**局部/限度支援**（例如針對極端複雜模式才開啟長駐 VM）。

### 方案 C: WASM 內嵌沙盒模式

- **概念**：將腳本編譯微 WebAssembly (.wasm)，直接在 Game Server 的同 Process 內呼叫。
- **優勢**：真正的微秒級零 IPC 延遲與記憶體安全隔離。
- **劣勢**：玩家自訂程式碼的編譯工具鏈較複雜。

### 方案 D: DSL 宣告式規則引擎

- **概念**：玩家不寫程式碼，只寫 JSON 描述 (例如觸發條件與給予效果)，Core 自行解譯。
- **優勢**：無需 Sandbox，執行速度即為原生速度。
- **劣勢**：表達能力極度受限，無法寫出複雜迴圈或數學演算法 (如特殊得分公式)。

### 方案 E: 非同步事件總線 (Event Sourcing / CQRS)

- **概念**：Game Core 不主動等答案，只是一直向 Queue 廣播「發生了什麼」，外部系統平行計算後發出「中斷/插入動作」指令給 Core。
- **優勢**：極致解耦，可掛載無數微服務。
- **劣勢**：對於「高度時間敏感且有嚴格先後順序」的核心麻將規則來說，非同步整合容易造成狀態不一或判定邏輯複雜化。**僅適用於被動的子系統（如成就系統、戰報紀錄）。**

---

## 3. 具體實作指引 (Implementation Guidelines)

要落實「首選架構」，請依循以下模組的開發綱要：

### 3.1 Frontend (Data-Driven UI)

前端的 Action 面板只認 JSON Schema，不寫死邏輯。

```json
{
  "available_actions": [
    { "id": "action_pon", "label": "碰", "type": "STANDARD", "details": [...] },
    { "id": "skill_peek", "label": "發動：透視", "type": "CUSTOM_PLUGIN", "details": { "cost": 50 } }
  ]
}
```

玩家點擊時，直接將 `{ actionId: "skill_peek" }` 往後端送，前端不需要理解這招有什麼效果。

### 3.2 Game Server Core (狀態與路由中心)

- **Plugin API Injection**：實作 `IMahjongRulePlugin` 介面，遊戲初始化時動態載入負責該局模式的 Plugin。
- **核心職責**：
  1. 只維護 Source of Truth (牌山剩幾張、誰有哪些牌)。
  2. 執行 Plugin 傳回來的狀態變更要求。
- **State Proxy**：把遊戲狀態與專屬字典 (`customState: Record<string, any>`) 包在一起送去給 Runner。

### 3.3 Function-Runner (執行引擎)

- **Local Code Cache (本地快取)**：目前的 `ModuleManager` 需要確保腳本拉取後緩存在記憶體中，只透過 `hash` 驗證版本，解決「載入與傳輸 (Fetch overhead)」問題。
- **Hook Manifest**：
  Runner 的入口點必須回報監聽清單，讓 Core 知道何時需要呼叫它：
  ```javascript
  export function init() {
    return {
      name: 'Super Power Mode',
      listenHooks: ['onTileDrawn', 'onCalculateScore'], // 宣告註冊
      initCustomState: { mp: 100, usedSkills: [] }, // 初始化自訂狀態
    };
  }
  ```

### 3.4 附屬微服務 (Event Sourcing Subsystems)

- 對於「成就解鎖」、「牌局回放存檔」、「全服統計數據」等不影響玩家當下能不能打出某張牌的邏輯，Game Server 直接拋 `EVENT_DISCARD_TILE` 到 Redis/Kafka Queue 中。這類被動系統自行去 Queue 消化這些 Event，絕不阻擋核心 Game 的執行續。
