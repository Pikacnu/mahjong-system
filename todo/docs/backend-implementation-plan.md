# 系統後端實作文件與多階段計畫 (Backend Implementation Plan)

## 專案目標與架構摘要

本專案旨在建立一個基於**「插件構建」**的麻將系統，允許高度客製化與擴充性。
架構分為以下幾個核心服務 (基於 gRPC 進行內部溝通)：

- **API-Server**: 負責持久化資料 (PostgreSQL) 與對外 Restful API。
- **Lobby-Server**: 對外 Gateway，處理 WebSocket 連線，驗證與路由請求至後端。
- **Game-Server**: 負責麻將遊戲運作核心，包含插件裝載與遊戲邏輯流轉。**無狀態/無持久化**。
- **Function-Runner / Function-Storage**: 處理動態插件/腳本的儲存與執行環境。

---

## 當前實作情況分析與痛點 (Current State & Issues)

### ✅ 已完成的部分 (Implemented)

1. **API-Server (Data Layer)**: 建立房間、玩家等 Rest API，整合 Drizzle ORM。
2. **Game-Server (Game Logic)**: 記憶體內的 `GameInstanceManager` 以及 `Game` 類別基礎。
3. **Lobby-Server (Gateway)**: WebSocket `/ws?playerId=<playerId>` 基礎路由與轉發。

### ❌ 痛點 1：傳輸格式未標準化 (Standardized Transmission Missing)

目前的資料傳輸與錯誤處理在各服務間並不一致，嚴重影響擴充與排錯：

- **REST API (API-Server)**: 回傳格式不一。成功時有時直接回傳陣列 (`GameManager.ts`)，錯誤時有時回傳 `{ message, errors }`，缺少統一的外層包裹 (Envelope)。
- **序列化 (Serialization)**: 各微服務之間 (如 Game-Server 與 Lobby-Server 或 Runner 之間) 將資料轉換成 gRPC `bytes` 所使用的 Buffer 編碼解碼缺乏共用的統一函式。

### ❌ 痛點 2：核心流程斷層 (Orchestration Gaps)

- **Game-Server 未被初始化**: API-Server 建立房間後（寫入 DB），並未呼叫 Game-Server `createRoom()`。導致 Lobby 嘗試開啟連線時找不到遊戲實體。
- **Game Readiness 缺失**: 收到 `GAME_START` 事件時，無檢查是否 4 名玩家皆連線且就緒。
- **無狀態/持久化脫節**: Game-Server 未將遊戲日誌與快照寫回 API-Server，一旦重啟所有進行中遊戲直接消失。

---

## 🚀 更詳細的多階段實作計畫 (Detailed Multi-Phase Plan)

### Phase 0: 傳輸標準化與基礎建設 (Standardized Transmission)

**目標：統一全域 API 回傳格式、gRPC 錯誤處理與序列化方法，為後續資料流打底。**

1. **建立共用型別庫 (`modules/utils/src/`)**
   - 建立 `response.ts`：定義標準 API 回傳介面 (`ApiResponse<T>` / `ApiError`)。
   - 建立 `serialization.ts`：實作共用的 `encodePayload` 與 `decodePayload`，供 gRPC bytes 傳輸統一使用。
   - 修改 `api-server/src/endpoints/*` (包含 game, player, room, plugin)，所有回傳皆使用標準 `ApiResponse` 封裝。
   - 統一 Validation 攔截器，確保 Zod 驗證錯誤格式一致。
2. **對齊 gRPC 定義 (`modules/proto/`)**
   - **前端 UI 渲染訊息標準化**：在 TypeScript 中利用 `modules/utils/src/ui_actions.ts` 定義標準化的 UI 元件 (如 `Button`, `Timer`, `Modal`)，這類動態操作由後端轉為 JSON/bytes 提供給前端，達到「UI 即資料」。
   - **gRPC 錯誤碼實體化 (無 Metadata 傳輸)**：捨棄舊有依賴 Metadata 拋錯誤的模式，改為在所有 Response Message 內部包含原生的統一 `ApiError` Message (內含 `ErrorCode` Enum 等，定義於 `common.proto` 之中)，實現完全由 Type 驅動的業務錯誤傳遞。
   - 調整 `game-server`, `function-runner`, `function-storage` 的 gRPC Handlers ，捨棄以 gRPC Error Status 觸發，改為回傳帶有 ApiError 的 Response。

_影響檔案：_ `utils/src/*`, `api-server/src/endpoints/*`, `proto/src/proto/common.proto`, 各服務之 `handler.ts`

### Phase 1: 核心流程貫通 (Core Flow Connection)

**目標：打通「建立房間 -> 加入玩家 -> 啟動遊戲」在微服務間的完整資料流。**

1. **微服務調用補全**:
   - 實作 API-Server 透過 gRPC Client 呼叫 Game-Server 的 `createRoom()` (在 DB 建立房間後立即觸發)。
   - 當 API-Server 收到「玩家加入房間」滿 4 人時，主動通知 Game-Server `playerJoined`。
2. **Game-Server 連線前置檢查**:
   - `lobby-server` 在處理 WebSocket 連線並啟動 `gameChannel` 前，必須確實調用 gRPC 詢問該 Game 實體是否存在且允許連線。
3. **基礎狀態查詢 API**:
   - 在 Game-Server 增加 `GetGameState` 的 gRPC RPC。
   - API-Server 或 Lobby-Server 實作供客戶端拉取 (Pull) 當前遊戲狀態的接口，讓客戶端中途加入也能拿到目前牌局資訊。

_影響檔案：_ `api-server` 及其 Endpoints, `lobby-server` WebSocket 升級流程, `game-server/src/manager/*` 等

### Phase 2: 完整遊戲狀態流轉與插件驗證 (Game State Pipeline & Plugins)

**目標：確保一局完整的麻將遊戲可以從發牌到結算，且能正確載入並啟動插件。**

1. **Game Readiness 邏輯校驗**:
   - Game-Server 內實作攔截指令：當有人發送 `GAME_START`，必須驗證 (1) 是否滿四人 (2) 房主權限 (3) 配置的 Plugin/規則 是否已從 Function-Storage 下載並 Readiness OK。
2. **插件流轉環境對接**:
   - 完善 Game-Server 呼叫 `Function-Runner` 的機制。
   - 在 `Game` 類別內的各個 phase (配牌, 摸牌, 宣告吃碰槓) 插入 Plugin Hook 呼叫點，並利用 Phase 0 寫好的 Serialization 收發資料。
3. **記憶體管理與限制**:
   - 加入 Timeout 倒數計時系統 (配合 `rx/js` 或 `setTimeout` 控制玩家思考時間)。

_影響檔案：_ `game-server/src/classes/game.ts`, `game-server/src/manager/*`, Function-Runner Client 實作

### Phase 3: 資料持久化層與斷線重連 (Persistence & Recovery)

**目標：落實 Game-Server 無狀態理念，資料交由 API-Server 備份，實作斷線重連與「插件狀態」還原。**

1. **Event Sourcing / Logging**:
   - Game-Server 每次 Broadcast 重大事件 (發牌/吃/碰/胡) 給玩家的同時，打包成 protobuf bytes 非同步呼叫 API-Server 的 `SaveGameLog` Endpoint (或直接寫入 Queue 表)。
   - **包含插件修改日誌 (Plugin Storage Patches)**：插件在 Hook 中回傳的 `storagePatch` 狀態變更，也必須作為 Event Log 的一部分寫入，以確保重播 (Replay) 時插件狀態一致。
2. **定期快照 (Snapshots)**:
   - 每一個 round (如：東風東局結束) 時，將 `Game` 的完整狀態序列化成 JSON/bytes，寫回 API-Server 的 `gameSnapshots`。
   - **插件狀態快照 (Plugin State Snapshot)**：在序列化 `Game` 與 `Round` 時，必須將 `PluginManager` 內的 `pluginStorages`、`globalStorageValues` 以及 `Round` 內的 `pluginStateStorage` 一併打包進 JSON。否則斷線重連後，插件計算的暫存分數或特殊規則狀態會直接歸零。
3. **災難復原 (Crash Recovery)**:
   - Game-Server 服務重新啟動時 (Init 階段)，向 API-Server 查詢「仍在進行中 (In-Progress)」的房間列表，並拉下最新的 Snapshot 與後續 Logs 來在記憶體重建 `GameInstanceManager` (包含動態掛載回原本的插件並塞入還原的狀態)。

_影響檔案：_ `api-server` DB 寫入模組, `game-server` 初始化腳本與事件派發區, **各類別與 `PluginManager` 的 `toJSON() / fromJSON()` 實作**

### Phase 4: 系統優化與擴展功能 (Optimization & Polish)

1. 加入 Heartbeat (Ping/Pong) 機制確保 WebSocket 連線存活，處理殭屍玩家離線接管。
2. 實作觀察者/OB 系統 (Observer Mode)，允許 LOBBY 轉發唯讀事件頻道。
3. Gateway Rate Limiting 避免單一連線洗爆 gRPC 串流。
