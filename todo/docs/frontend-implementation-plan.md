# 前端 UI 標準化與實作計畫 (Frontend UI Standardization Plan)

## 專案目標摘要

本專案為「插件構建」的麻將系統，意味著遊戲規則、版面可能因為不同的插件而產生變動。前端不應該寫死所有的遊戲按鈕與互動，而是應該由後端 (Game-Server / Plugins) 指揮前端產生動態 UI 互動。

透過使用共用的 `UIAction` 介面與 `encodeToBytes` 作為傳輸橋樑，我們可以在保持 gRPC 輕量的情況下，讓前端具備強大的擴充渲染能力。

---

## 核心設計理念：UI 即資料 (UI as Data)

前端主要扮演**渲染引擎 (Render Engine)** 的角色。當從 `Lobby-Server` 透過 WebSocket 收到指令事件時，前端只需負責將接收到的 `UIAction` 資料轉譯為畫面元件。

### ✅ Phase 1: 制定共用 UI 型別定義 (`modules/utils/src/ui_actions.ts`)

我們需要一套前端與後端共用的型別定義。在 `utils` 模組中建立，讓 Game-Server 產生按鈕，Lobby-Server 轉發，前端負責解析。

```typescript
// 1. 定義可支援的元件類型
export enum UIComponentType {
  BUTTON = 'BUTTON',
  TIMER = 'TIMER',
  TOAST = 'TOAST',
  DIALOG = 'DIALOG',
}

// 2. 定義按鈕元件
export interface UIButtonAction {
  type: UIComponentType.BUTTON;
  id: string; // 例如 'action_chi'
  label: string; // 顯示文字：'吃牌'
  style?: 'primary' | 'secondary' | 'danger';
  payload: any; // 點擊後，要原封不動傳回伺服器的資料 (例如是哪幾張牌要吃)
}

// 3. 定義倒數計時器
export interface UITimerAction {
  type: UIComponentType.TIMER;
  id: string;
  durationMs: number; // 倒數總毫秒
  warningMs?: number; // 剩下幾毫秒要變紅字
}

export type UIAction = UIButtonAction | UITimerAction;
```

### ⚡ Phase 2: 後端利用 `encodeToBytes` 封裝客製化 UI

原本的 Protobuf 難以處理極度動態的 JSON 結構，但是我們已經有了 `#sym:encodeToBytes` 與 `#sym:decodeFromBytes`。

1. **插件/遊戲核心產生 UI**:
   - 輪到某玩家摸牌時，Game-Server 計算該玩家能做的動作。
   - 產生 JSON 物件 `[{ type: 'BUTTON', label: '聽牌', ... }]`。
2. **轉換為 Bytes 送入 gRPC通道**:
   - 呼叫 `const uibytes = encodeToBytes(uiActionArray)`。
   - 將 `uibytes` 塞進 protobuf 定義的 `ReactionMessage` 之中發往 Lobby。

### 💻 Phase 3: 前端動態渲染引擎實作

前端 (無論是 React, Vue, 或純 JS) 準備一個專門接聽 WebSocket 的元件。

1. **解碼 UI 指令**:
   - 收到 WebSocket 事件後，調用 `decodeFromBytes(message.data)` 還原回 `UIAction[]`。
2. **動態渲染 Factory**:
   - 實作一份 `<DynamicActionPanel actions={actions} />`。
   - 迴圈跑 switch：遇到 `BUTTON` 畫按鈕、遇到 `TIMER` 開始時間條。
3. **將操作 Payload 打回後端**:
   - 若玩家點擊了「吃牌」按鈕，前端不需要知道「吃牌」的詳細邏輯，只需要呼叫 `ws.send(JSON.stringify(button.payload))`。
   - Lobby-Server 收到 Payload 後原樣送往下游，插件就能無縫接回剛剛丟出去的資料！

---

## 優勢總結

1. **完全解耦**: 如果未來加了「血流成河」或「特殊規則」插件，多出了「換三張」這個按鈕。**前端一行 Code 都不用改**！插件決定畫什麼按鈕，前端照畫。
2. **傳輸極簡**: 透過共用的 `encodeToBytes`，Protobuf 只需要維持一個 `bytes data` 欄位，無需隨著 UI 擴充頻繁修改 proto 定義。
