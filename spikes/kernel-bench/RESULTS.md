# Kernel hot-path benchmark: Go + Starlark vs TypeScript

> 2026-11-05。用來決定核心與 game-server 的語言（見 [kernel-concept.md](../../modules/utils/docs/kernel-concept.md)、[flow-and-architecture-plan.md](../../modules/utils/docs/flow-and-architecture-plan.md) A5）。

## 量什麼

一個「決策」= 一次打牌後的宣告視窗，對另外三家各做一次：

1. **核心（原生）**：榮和分解數（`countDecompositions`）、碰／吃判定、`waits()`（34 次完成判定）。
2. **內容規則**：一段規則腳本（斷么、役牌、振聽、能否榮和），用不同的執行方式跑。

同一份規則原始碼：`ts/src/rule.js`（原生 JIT、QuickJS、Worker、gRPC 都跑這一份）、`go/rule.star`（Starlark）、`go/rule.go`（Go 原生）。

**正確性**：兩種語言用相同的 RNG（mulberry32）產生相同的 20,000 個情境；每個變體的 checksum 都必須等於原生參考值，否則失敗。Go 與 TS 的參考 checksum 在 n = 1,000 / 2,000 / 5,000 / 20,000 全部相同。另有單元測試：TS 14 個、Go 5 組（含 Starlark 與 Go 原生在 1,500 次規則呼叫上結果一致）。

## 環境

- i7-13700H（20 執行緒）、16 GB、Windows 11 上的 Docker Desktop（Linux 容器，兩種語言同一個 VM）
- `golang:1.26`（go1.26.10）、`oven/bun:1.3.13`、`go.starlark.net`、`quickjs-emscripten 0.32.0`、`@grpc/grpc-js 1.14.3`
- 單執行緒、依序執行。每個變體：暖身 + 5 次量測取中位數；整個測試套件跑 3 次，下表再取 3 次的中位數。

## 結果

| 變體 | n | 決策/秒（中位數） | 3 次範圍 | p50 µs | p99 µs | 相對 Go 原生 |
| :--- | ---: | ---: | :--- | ---: | ---: | ---: |
| go：只有核心（無規則） | 20000 | 96738 | 96077–97229 | 9.6 | 26.1 | 1.04× |
| **go 原生** | 20000 | **93427** | 93240–94964 | 10.0 | 24.9 | 1.00× |
| **go + Starlark（行程內）** | 20000 | **38194** | 38168–38363 | 23.8 | 70.9 | 0.41× |
| ts：只有核心（無規則） | 20000 | 77290 | 76049–78070 | 12.2 | 27.1 | 0.83× |
| **ts 原生 JIT** | 20000 | **74132** | 73150–74548 | 12.7 | 26.8 | 0.79× |
| ts 原生 JIT + JSON 轉換（只量邊界成本） | 20000 | 37996 | 37938–38450 | 24.0 | 58.8 | 0.41× |
| **ts + QuickJS（行程內）** | 20000 | **15357** | 15073–15563 | 60.2 | 134.0 | 0.16× |
| ts + QuickJS 每次呼叫建新 context（**目前 RunFunction 的做法**） | 1000 | 923 | 907–950 | 1027.9 | 1739.8 | 0.01× |
| ts + Worker JIT，每位玩家一則訊息 | 5000 | 3372 | 2041–3419 | 211.0 | 2651.7 | 0.04× |
| ts + Worker JIT，每個決策一則訊息 | 5000 | 7490 | 4931–8043 | 87.1 | 2057.2 | 0.08× |
| ts + 遠端 gRPC runner，每位玩家一次呼叫 | 2000 | 290 | 239–318 | 1714.0 | 30909.4 | 0.003× |
| ts + 遠端 gRPC runner，每個決策一次呼叫 | 2000 | 355 | 240–373 | 1381.0 | 18261.4 | 0.004× |

| 核心 builtin | Go | TS（Bun JIT） | Go / TS |
| :--- | ---: | ---: | ---: |
| `waits()`，每秒處理的 13 張手牌數 | 310825 | 256414 | 1.21× |
| 建牌山 + 洗牌，每秒 | 2867073 | 341348 | 8.40× |

### 換算成每次規則呼叫的成本

（決策時間減去「只有核心」的時間，再除以 3 家）

| 執行方式 | 每次規則呼叫 |
| :--- | ---: |
| Go 原生 | 0.12 µs |
| TS 原生 JIT | 0.18 µs |
| TS 原生 + JSON 轉換 | 4.5 µs |
| **Go + Starlark（含 Go → Starlark 值轉換）** | **5.3 µs** |
| **TS + QuickJS 行程內（含 JSON 轉換）** | **17.4 µs** |
| Worker（JIT）一則訊息 | 95–121 µs |
| QuickJS 每次建新 context | 357 µs |
| 遠端 gRPC（grpc-js on Bun） | p50 約 0.6–1.4 ms；p99 18–31 ms（尾端主導） |

## 結論

1. **原生核心的語言差距很小。** Go 比 Bun JIT 快 1.2–1.3×（`waits()` 1.21×）。只看這一點，不構成換語言的理由。建牌山差 8.4×，但每局只做一次，影響可以忽略。
2. **沙箱的選擇差 2.5×。** Go + Starlark（38k/s）對 TS + QuickJS（15k/s）。Starlark 的完整執行成本（5.3 µs）≈ TS 光是 JSON 轉換的成本（4.5 µs）；QuickJS 再多出約 13 µs 的直譯成本。尾端延遲也一樣：p99 71 µs 對 134 µs。
3. **架構的差距是 100× 以上。** 行程內（5–17 µs）對遠端 gRPC（毫秒級，p99 數十毫秒）。目前 `RunFunction` 每次建新 context，比行程內 QuickJS 慢約 20×。**不論選哪個語言，都應該先把規則執行搬進行程內。**
4. **「compiled JS 比較快嗎？」** 是，Bun 的 JIT 是 JS 最快的執行方式（74k/s），但只能用在**同一個 isolate 內**，也就是沒有沙箱。放到 Worker 取得執行緒隔離後，每則訊息要 95–121 µs，p99 超過 2 ms，反而比 QuickJS 行程內慢。Worker 也不是安全邊界。所以 JIT 適合**第一方內容**（日麻 RuleSet），不適合不受信任的使用者內容。

### 放到實際需求上看

以下是估算，不是量測：一場半莊約 8–12 局，每局約 70 次打牌，加上自家決策，大約 1,400 個決策，換算每場每秒約 0.6 個決策。

- **真人對局**：即使是最慢的行程內方案（QuickJS 15k/s），一個核心也能負擔上萬場同時進行的對局。CPU 不是瓶頸，所有行程內方案都遠超需求；遠端 gRPC 的延遲對真人也可以接受。
- **AI 自我對弈、模擬**：沒有真人等待，吞吐量直接決定成本。以每場 1,400 個決策計算，每核心每秒可跑的場數：Go 原生約 67、Go + Starlark 約 27、TS + QuickJS 約 11、遠端 gRPC 不到 0.3。

**依數據的判斷：** 如果「高效」指的是 AI 對弈或單一 Pod 承載大量對局，Go + Starlark 有明確的數據支持：沙箱快 2.5×，尾端延遲較好，而且一個行程就能用到多核心（未量測）。如果只考慮真人對局，兩者都遠超需求，差異不重要。

## 每場對局的記憶體（補充量測）

每場對局一個隔離單位，載入同一份規則與一小份插件狀態，量測 RSS 增量（Linux 容器，`ts/src/mem.ts`、`go/mem.go`）：

| 隔離單位 | 數量 | 每單位 | 300 場合計（估） |
| :--- | ---: | ---: | ---: |
| Starlark（編譯後模組 + thread） | 300 / 1000 | 13 KB / 6 KB | 約 4 MB |
| QuickJS（每場一個 runtime + context） | 300 / 1000 | 0.28 MB / 0.14 MB | 約 40–85 MB |
| Bun Worker（只載入規則，不含 QuickJS） | 20 / 50 | 3.1 MB / 2.8 MB | 約 850 MB 以上 |

- Worker 的數字是**下限**：目前 runner 的 Worker 內還會各自載入 QuickJS。
- 目前 runner 的設計是**每個 live module 獨占一個 Worker**（`liveModuleManager.ts`：`createLiveModule` 取得 Worker 後標記為 `Occupied`，直到 `removeLiveModule` 才釋放），而 `getInstance()` 預設只有 2 個 Worker。也就是說，第 3 個 live module 就會丟出 `No idle worker available`；要支撐 300 場 × N 個插件，需要 300 × N 個 Worker。

## 沒有量測的部分（限制）

- **規則很小。** 真實的役判定與計分會更重；直譯器相對原生的差距會隨規則變重而放大。Starlark 對 QuickJS 在重規則上的比例沒有量測。
- **多核心。** 全部是單執行緒。Go 可以在單一行程內用 goroutine 使用所有核心；Bun 需要多個行程或 Worker。
- **記憶體。** 只量了隔離單位本身（見上節），沒有量 game-server 的連線、狀態與事件的記憶體。
- **gRPC 的數字只代表 grpc-js on Bun。** 這正是目前系統使用的組合，但不代表 gRPC 本身；Go 的 gRPC 沒有量測。gRPC 的結果尾端延遲很重、變異大（3 次範圍 239–373/s）。
- **Starlark 預設不允許遞迴。** 本測試的分解演算法在 Go 原生端執行（符合 kernel-concept 的 builtin 設計），沒有測 Starlark 寫分解演算法的情況。
- **Windows 主機上的 Go 無法執行。** Windows 的 Application Control 擋下新編譯的執行檔；而且 Windows 的單調時鐘解析度約 0.5 ms，延遲百分位數無效。所以兩種語言都在 Linux 容器內量測。`results/ts-windows-host.json` 是 TS 在 Windows 主機上的一次早期執行（沒有 JSON 轉換變體），數字與容器內相近（原生 JIT 67k/s）。

## 重現

```bash
# 在 spikes/kernel-bench 執行；兩者都在 Linux 容器中
docker run --rm -v "$PWD:/w" -w /w/go golang:1.26 sh -c "go test ./... && go run ."
docker run --rm -v "$PWD:/w" oven/bun:1.3.13 sh -c \
  "mkdir -p /tmp/kb/results && cp -r /w/ts /tmp/kb/ts && cd /tmp/kb/ts && bun install && bun test && bun run src/bench.ts && cp /tmp/kb/results/ts.json /w/results/"
bun run summarize.ts   # 彙整 results/*-linux-run*.json
```

| 檔案 | 內容 |
| :--- | :--- |
| `ts/src/core.ts`、`go/core.go` | RNG、牌山、分解、`waits()` |
| `ts/src/workload.ts`、`go/workload.go` | 情境產生、核心評估、checksum |
| `ts/src/rule.js`、`go/rule.star`、`go/rule.go` | 規則腳本的三個版本 |
| `ts/src/bench.ts`、`go/main.go` | 各變體的量測 |
| `ts/src/rule-worker.ts`、`ts/src/grpc-server.ts` | Worker 與遠端 gRPC 的規則宿主 |
| `ts/src/mem.ts`、`go/mem.go` | 每個隔離單位的記憶體（`bun run src/mem.ts quickjs 300`、`go run . mem 300`） |
| `ts/test/core.test.ts`、`go/core_test.go` | 正確性測試 |
| `results/*.json` | 原始結果 |
