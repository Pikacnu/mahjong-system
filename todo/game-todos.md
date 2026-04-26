# Game (Round) TODOs — 摘錄自 modules/game-server/src/type/game.ts

檔案生成：2026-04-26

來源：
- 原始程式檔案：[modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L1)

---

## 發現的 TODO 條目

1. **檔頭總覽 TODO** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L45)
   - 內容：檔頭列出三大面向：Game End Logic / Player Action Logic / Score Calculation Logic。
   - 建議：將三大面向拆成更細的子任務（例如：動作驗證、回合結束判定、計分合約），並建立優先順序與 acceptance criteria。

2. **空牌牆判定（design note）** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L128)
   - 內容：TODO 註記指引如何處理 tile pile 為空的情況（draw / 流局等）。
   - 建議：實作判斷邏輯並觸發 plugin hook（例如：`LifecycleHookType.RoundEnd` 或專用 `Draw/Exhausted` hook），在 hook payload 中帶上 draw/reason。

3. **draw resolution 補充** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L370)
   - 內容：註記「if this.currentDrawTile is relevant, add to player's hand here」。
   - 建議：定義何時將 draw tile 真正歸入玩家手牌（例如：自摸/權利獲得後），並撰寫小函式處理手牌更新與 UI 廣播。

4. **Chi 驗證** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L396)
   - 內容：註記需驗證 chi（必須為下一位玩家）、更新手牌與 melds。
   - 建議：實作 chi 合法性檢查、從手牌移除 tiles、加入 meld，並處理與其他反應（Ron/Pon）的優先權。

5. **Pon 驗證** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L409)
   - 內容：驗證三張相同 tile，並更新手牌/meld。
   - 建議：實作 triplet 檢查、同步更新 table/player state、處理分數或權利變更（由 scoring module/ plugin 負責細節）。

6. **Kan 流程** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L422)
   - 內容：處理明槓/暗槓/加槓、補發 tiles 等流程。
   - 建議：根據槓型差異實作補發 tile 與狀態更新，並在必要時觸發補發通知或 plugin hook。

7. **Riichi 處理** — [modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L435)
   - 內容：標記立直、扣立直棒、後續手牌限制等。
   - 建議：實作立直標記流程（包含扣棒、鎖定手牌/聽牌檢查）、並把相關變更透過 hook 通知外部系統。

---

## 優先順序建議（短期）

1. 玩家行動驗證與套用（Chi/Pon/Kan/Riichi） — 確保核心遊戲流程正確。
2. 空牌牆判定與回合結束 hook — 確保 match 終止/流局邏輯可擴充。
3. draw 分配/手牌更新邏輯 — 避免不一致的 tile 歸屬。
4. 設計計分契約（scoring contract）或交由 plugin 實作。

## 建議的 acceptance criteria

- 每種動作（Chi/Pon/Kan/Ron/Tsumo/Riichi）都有明確的驗證函式和單元測試。  
- 空牌牆到達時能正確觸發 round-end 流程，且 plugin 能收到包含 draw/reason 的 payload。  
- draw tile 的歸屬行為（哪時放入手牌）在邏輯上可重現並且有測試覆蓋。  
- 所有狀態更新（手牌/meld/table）應透過單一責任的 helper 函式執行以降低副作用。

## 下一步（可由我代辦）

- 我可以實作 `Chi/Pon/Kan/Riichi` 的驗證及手牌更新，含對外 hook 呼叫與單元測試（選此請回覆：`1`）。
- 我可以實作空牌牆判定並把 draw/reason 放進 `GameEndCallbackData`（選此請回覆：`2`）。
- 我可以草擬 scoring contract（plugin interface）並產生範例實作（選此請回覆：`3`）。

---

## 參考檔案

- Plugin/zod schema（已新增說明）：[modules/game-server/src/type/game_api_docs.ts](modules/game-server/src/type/game_api_docs.ts#L1)
- 主程式檔：[modules/game-server/src/type/game.ts](modules/game-server/src/type/game.ts#L1)

---

檔案由 AI 協助產生。如需我直接開始實作其中一項，請回覆上方對應數字。
