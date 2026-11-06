# 日本立直麻將規則系統：方向與路線圖

目標是一個以插件為基礎、可擴展且自由度高的系統，能完整實作日本立直麻將規則。本文件說明架構方向、模組切分、與現有程式的對接方式、擴充點與實作順序。

> 狀態：方向草案（2026-11-05）。尚未開始實作。規則的預設值見第 8 節，待你確認。

## 1. 目標與非目標

**目標**
- 完整的日本立直麻將規則：役、符、番、點數、副露、槓、流局、局與終局。
- 規則的可變部分（役集合、點數公式、流局條件、局數、赤牌數量等）可以替換或增加，不需要改核心。
- 可重播、可測試：同一組 `seed` 與動作序列，必定得到同一結果。

**非目標（目前）**
- 網路對戰與帳號系統（由 lobby / api-server 負責，不在規則層）。
- 自動打牌 AI。

## 2. 核心原則

1. **規則核心是純函式。** 放在獨立模組，無 I/O、無 gRPC、無全域狀態。輸入一個狀態與一個動作，輸出新狀態與事件。game-server 只負責流程與網路。
2. **第一方規則在行程內執行。** 高頻判斷（每次摸牌、打牌後的副露/榮和可能性）不經過 gRPC。
3. **使用者程式碼在 game-server 行程內的沙箱執行。** 每局一個 QuickJS runtime，同步呼叫；重運算由 SDK 的原生 builtin 提供（見 [plugin-runtime-design.md](plugin-runtime-design.md)）。
4. **狀態可由輸入重建。** 牌山由 `seed` 決定，之後的所有狀態變更都來自動作。快照可以只存 `seed + 起始設定 + 動作日誌`。
5. **規則 = 設定 + 模組。** `RuleConfig` 負責數值與開關；模組（役集合、點數公式、流程規則）負責邏輯。

## 3. 模組切分

建議新增一個純 TypeScript 的 workspace 模組，例如 `modules/riichi`，不依賴 `game-server`。

| 子模組 | 職責 | 關鍵輸出 |
| :--- | :--- | :--- |
| `tiles` | 牌的表示、136 張（含赤牌）的定義 | `TileId`（0–33）與 `isRed` |
| `wall` | 以 `seed` 洗牌、切出牌山、王牌（嶺上 4 張、dora 指示與裏 dora） | `buildWall(seed, config)` |
| `hand` | 分解為 4 面子 + 雀頭、七對子、國士無雙；向聽數、待牌、フリテン | `decompose(hand)`、`waits(hand)` |
| `yaku` | 每個役是一個純函式 predicate，含互斥與副露減番 | `evaluateYaku(ctx) → Yaku[]` |
| `score` | 符計算、番數到點數（滿貫、跳滿、倍滿、三倍滿、役滿）、支付（親/子、本場、立直棒） | `calcScore(ctx)`、`distribute(...)` |
| `flow` | 副露合法性（吃只能吃上家、喰い替え）、槓與補牌、流局判定、局與連莊、東風/半莊、飛び終局 | `nextState(state, action)` |

### 3.1 胡牌上下文（建議的核心型別）

```typescript
type WinContext = {
  hand: TileId[];                 // 門前 + 副露展開後的牌（含和了牌）
  melds: Meld[];                  // 副露（吃 / 碰 / 明槓 / 暗槓 / 加槓）
  winTile: TileId;
  winType: 'ron' | 'tsumo';
  seatWind: Wind;
  roundWind: Wind;
  flags: {
    riichi: boolean;
    doubleRiichi: boolean;
    ippatsu: boolean;
    rinshan: boolean;             // 嶺上開花
    chankan: boolean;             // 搶槓
    haitei: boolean;              // 海底摸月
    houtei: boolean;              // 河底撈魚
    tenhou: boolean;
    chiihou: boolean;
  };
  dora: { dora: number; uraDora: number; redDora: number };
  config: RuleConfig;
};
```

`evaluateYaku` 與 `calcScore` 都只吃這個型別。這樣規則可以用固定的 fixture 測試，不需要啟動整場遊戲。

## 4. 與現有程式的對接

| 現況 | 問題 | 方向 |
| :--- | :--- | :--- |
| `MahjongTile`（`Wind` / `Dragon` / `MAN` / `PIN` / `SOU` / `BLANK`） | `BLANK` 沒有意義，且沒有赤牌的統一表示 | 規則層用 `TileId`，UI 層再轉換成目前的型別 |
| `Table`（無王牌、無 dora 指示） | 無法表示完整的牌山 | 由 `wall` 模組產生牌山與王牌，`Table` 只負責桌面 |
| `Round.handleResolvingPlayerAction` 不改手牌與副露 | 吃碰槓與打牌沒有資料變更 | 由 `flow.nextState` 產生狀態轉換，`Round` 只套用結果 |
| `Round.calcScore()` 沒有呼叫點 | 結算不會執行 | 接到 `score` 模組，在流局與和了時呼叫 |
| `DecisionHookType` 已有 `EvaluateHand`、`CalculateScore`、`ScoreDistribution` | 定義了但沒有接線 | 作為使用者插件的擴充點（見第 5 節） |
| `PlayerAction.DrawTile` 用來表示打牌 | 名稱誤導 | 建議改為 `Discard`，這是小改動 |
| `Game` 的 lobby/game 狀態列舉未使用 | 無法表示東風戰、半莊、飛び終局 | `flow` 模組負責局推進與終局條件，`Game` 只讀取結果 |

## 5. 擴充點

| Hook | 用途 | 呼叫頻率 | 執行位置 |
| :--- | :--- | :--- | :--- |
| `onEvaluateAvailableActions` | 判斷可副露、可榮和等 | 每次摸牌、打牌 | 第一方，行程內 |
| `onValidateAction` | 否決非法動作 | 每次玩家回覆 | 第一方，行程內 |
| `onEvaluateHand`（`EvaluateHand`） | 新增自訂役 | 每次和了 | 可用使用者插件（行程內沙箱） |
| `onCalculateScore`（`CalculateScore`） | 修改番數、符數、點數 | 每次和了 | 可用使用者插件（行程內沙箱） |
| `onScoreDistribution`（`ScoreDistribution`） | 改變支付方式 | 每局結算 | 可用使用者插件（行程內沙箱） |
| `RuleConfig` 覆寫 | 開關與數值（赤牌數、局數、起始點數） | 設定時 | 純資料，不執行程式碼 |

**hook 的同步約定（更新）：** 使用者插件改在行程內的 QuickJS 同步執行，所以 `api_docs.md`「hook 必須同步」的約定可以維持。原本的建議（下列兩點）只適用於遠端 runner，已不需要：
- 高頻 hook（第一方）維持同步。
- 低頻 hook（和了與結算）允許非同步，並設定逾時。

## 6. 測試策略

- **單元測試（bun test）**：`decompose`、`evaluateYaku`、`calcScore` 使用固定手牌 fixture。每個役至少一個正例與一個反例；符與點數表各自有 fixture。
- **性質測試**：牌山必須是 136 張（含赤牌），每種牌 4 張；分解前後牌數守恆；點數結算後的總和守恆（只有立直棒與本場會改變總量，要有明確的規則）。
- **整局 golden test**：固定 `seed` 與動作序列，驗證每局的分數與最終結果。
- **外部比對**：抽樣用公開的點數計算器比對結果，作為 fixture 的來源。

## 7. 路線圖

1. **R0：規則決定與型別。** 完成第 8 節的預設值，定下 `TileId`、`WinContext`、`RuleConfig` 的初版。
2. **R1：純函式核心。** `tiles`、`wall`（seed 洗牌）、`hand`（分解、向聽、待牌、フリテン）。測試覆蓋率先到位。
3. **R2：役與點數。** 先做門前役與常用役，再補齊全部役與役滿；符與番數到點數；支付。
4. **R3：流程規則。** 副露與槓（含嶺上與搶槓）、流局（荒牌、九種九牌、四風連打、四家立直、四槓散了、三家和、流し満貫）、局推進與連莊、終局。接到 `game-server` 的 `Round`，替換目前的 TODO 與未呼叫的 `calcScore`。
5. **R4：擴充點與 house rule。** 接上第 5 節的 hook，並用 house rule 範例驗證（例如：關閉喰い断、改變赤牌數）。
6. **R5：持久化與重播。** 快照改為 `seed + 起始設定 + 動作日誌`。這比序列化整個狀態簡單，也讓重播成為測試手段。這會取代 backend 計畫中 Phase 3 的部分設計。
7. **R6：使用者插件。** game Worker 內的 QuickJS 執行（每局一個 runtime，每一局重建 context），上傳時由 function-storage 做型別檢查與一致性測試（插件輸出必須通過第 6 節的性質測試）。

## 8. 規則預設值（2026-11-06 已採用）

> 2026-11-06 確認：以下建議值已採用為預設。各項都是 `RuleConfig` 的參數，之後可以改，不需要改核心。

1. **基準規則。** 已採用：標準日本立直（以天鳳與日本麻將協會的常見規則為參考），全部做成 `RuleConfig` 的開關。
2. **赤牌。** 已採用：每種花色的 5 各一張（共 3 張），數量可設定為 0–4。
3. **喰い断（副露斷幺九）。** 已採用：允許。
4. **後付け（副露後的役）。** 已採用：允許。
5. **同時榮和。** 已採用：頭ハネ（只取最靠近放槍者的一家）。全部榮和為可選設定。
6. **起始點數與飛び。** 已採用：起始 25000，點數低於 0 立即終局。
7. **局數。** 已採用：先做東風戰與半莊戰兩種，局數為 `RuleConfig` 的參數。
8. **流局的三家和。** 已採用：視為流局（不做三家和了）。

## 9. 主要風險

- **役的正確性。** 役與符很容易出錯，需要以 fixture 與外部計算器比對，這是第一優先。
- **插件改寫點數的風險。** 插件可以改寫點數，因此每次結算後都要檢查守恆規則，發現不守恆就拒絕該結果。
- **分解演算法的效能。** 每次判斷都要做分解，14 張牌用回溯法就足夠，但要避免在高頻 hook 中呼叫過多次。
