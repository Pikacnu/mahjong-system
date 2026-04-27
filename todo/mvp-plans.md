# MVP 三日計畫 — mahjong-system

目標：在 3 天內完成一個可玩的最小產品（MVP），包含多人連線單回合流程（摸牌、出牌、回合結束）、基本插件整合（furtin）、以及最少的驗證與測試。

## MVP 範圍（最小必備）
- 核心 Game / Round：能完成一個回合的流程（抓牌 → 出牌 → 檢查結束）。
- WebSocket 最小消息：`GameStart`、`PlayerGetsTile`、`PlayerDiscardsTile`、`RoundEnd`、`ShowInfo`。
- 動作驗證：Draw / Discard（防止無效出牌），包含 timeout 的預設行為。
- 簡化計分：在偵測到 Ron/Tsumo 或流局時回傳簡易分數（可為 placeholder）。
- Plugin：整合已新增的 `furtin` 插件，當玩家棄牌時通知 plugin，並遵從 plugin 的 `ValidateAction` 回傳（拒絕 Ron）。
- 型別與驗證：使用 zod 對 plugin 回傳與 Game API 做防禦性解析。
- 測試：針對 core loop 與 furtin 寫基本單元測試。

## 交付項目
- `modules/game-server/src/type/game.ts`：最小 core loop 與 plugin 呼叫點。
- WebSocket 最小 handler（`modules/game-server/index.ts`）：可收發最少事件以驅動 demo。
- `modules/plugins/src/system/furtin.ts`：已加入示例 plugin（記錄棄牌並拒絕 Ron）。
- `docs/mvp-3day-plan.md`（本檔）。
- README demo 指令與測試腳本。

---

## 三日計畫（每日任務與驗收準則）

### Day 1 — 基礎建置與核心回合（目標：核心流程可跑通）
- 任務：
  - 確認並鎖定 MVP 範圍與 acceptance criteria（已完成）。
  - 本地安裝與 TypeScript 型別檢查（`bun run tsc --noEmit`）。
  - 在 `Round` 實作最小回合流程：Start → PlayerGetsTile → 等待出牌 → 處理出牌 → 走到下一回合或結束。
  - 在玩家出牌點呼叫 `runHook`（EvaluateAvailableActions / ResolveAction），並把棄牌資訊（`discardedTile`）放到 payload。
  - 暫時以 in-memory 狀態（不持久化）。
- 驗收：
  - `tsc --noEmit` 無致命錯誤。
  - 可用單元測試模擬玩家抓牌並出牌流程（測試應通過）。

### Day 2 — 動作驗證、插件與計分骨幹（目標：插件生效與基本計分流程）
- 任務：
  - 實作 Draw/Discard 的驗證與 timeout 處理（預設 skip 或自動出牌）。
  - 完成 furtin 的整合：出牌時通知 plugin，並依 `ValidateAction` 的 `reject` 來拒絕 Ron。
  - 實作簡化的 scoring skeleton（placeholder 演算法），並在回合結束時透過 `patchesResolver` 更新分數。
  - 加入 zod 驗證 plugin 回傳（已在 `game_api_docs.ts` 加入 schema）。
- 驗收：
  - furtin 在測試中能成功阻止 Ron 流程。
  - 回合結束會產生 score patch 並被正確處理（測試或手動驗證）。

### Day 3 — 測試、文件與 demo（目標：整理交付與 CI）
- 任務：
  - 撰寫單元測試（core loop、furtin、patchesResolver）與簡易整合測試。
  - 製作 README 與 demo 指令（如何啟動、如何模擬一回合）。
  - 設定 CI（至少執行 `tsc` 與 tests）。
  - 修正測試/型別發現的問題，整理未完事項 backlog（例如完整計分引擎）。
- 驗收：
  - CI 成功（`tsc` 與 tests 通過）。
  - README 提供可複製的 demo 步驟。

---

## 風險、決策與建議
- 計分引擎為最大風險點：完整日本立直計分與和牌判定複雜，建議 MVP 使用 placeholder 或委外（plugin/外部服務）。
- 規則變體（例如赤ドラ/嶺上/槓上）會增加大量驗證工時，先以最小可接受規則集（少量役）開始。
- Persistence：MVP 先採記憶體實作，若要上線再接 Storage Gateway。

## 快速命令（本地開發）
```
# TypeScript 型別檢查
bun run tsc --noEmit

# 若有 build script
npm run build

# 啟動 game-server (視實作)
bun run start:game-server
```

---

若你同意此三日計畫，我會立刻從 Day 1 開始：先把 `Round` 的出牌流程與 plugin 呼叫完善，並在完成後回報/提交 patch。請回覆「開始 Day 1」。
