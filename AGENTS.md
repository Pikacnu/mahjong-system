# AGENTS.md — AI 協作交接文件

> 給之後接手這個專案的 AI。先讀這份，再讀第 3 節列的文件。最後更新：2026-11-06。

## 1. 專案與現況

- **專案**：以插件為基礎的麻將系統，目標是 L5（核心不認識麻將，日麻、三麻、台灣 16 張都是內容）。使用者的核心需求：可擴展、高自由度、先做核心再做內容。
- **現況**：大部分還是**設計與規劃**。程式碼只完成了幾處接線修正與 spike（量測），對局還跑不完一局。
- **測試**：專案內沒有測試（0 個）。spike 的測試與 benchmark 在 `spikes/kernel-bench/`，但整個 `spikes/` 目錄已加入 `.gitignore`（2026-11-06），**不進 git**，只存在於量測的那台機器上。所以文件裡連到 `spikes/` 的路徑，在新 clone 中不會存在。
- **Git**：2026-11-06 已 commit 並 push 到 `origin/dev`（remote：`https://github.com/Pikacnu/mahjong-system.git`）。使用者沒有明確要求時，不要 commit、push 或開 PR。`main` 是預設分支，不要直接改。
- **語言**：使用者用繁體中文溝通。設計文件用中文，模組 README 用英文。

## 2. 目標架構（已決定）

| 服務 | 職責 | 現況 |
| :--- | :--- | :--- |
| lobby-server | Edge / BFF：靜態資源、登入、發 ticket；房間外的守門員。不轉發遊戲訊息 | 目前還在轉發遊戲訊息（要改） |
| api-server | 房間、配對、分配對局、持久化；訂閱對局事件（觀戰、成就、牌譜） | 大致符合 |
| game-server | 對局本身 + 插件沙箱。K 個 game Worker，每個負責一批對局；每局一個 QuickJS runtime，每個插件一個 context，**每一局重建** context | 沙箱部分還沒做（目前插件在 function-runner） |
| function-storage | 插件與 RuleSet 的 registry；上傳時的 TS/JS 檢查、建置、測試（子行程執行） | 儲存符合；檢查管線還沒做 |
| ~~function-runner~~ | **已決定移除**：執行併入 game-server，驗證併入 function-storage | 還在 repo 裡，還在跑 |
| 基礎設施 | PostgreSQL、NATS JetStream（對局日誌，**先寫再套用**）、S3 + CDN | JetStream 尚未接入 |

**規則的形式**：全部是插件。日麻基本規則是「預設模板庫」，格式和使用者插件相同。

完整說明見 `modules/utils/docs/plugin-runtime-design.md`。

## 3. 必讀文件（按順序）

| 文件 | 是什麼 | 注意 |
| :--- | :--- | :--- |
| `modules/utils/docs/plugin-runtime-design.md` | **主要規劃**：4 服務、Worker 分片沙箱、故障隔離、檢查管線、JetStream 日誌、修改步驟 | 規劃，不是現況 |
| `modules/utils/docs/kernel-concept.md` | L5 通用核心：牌、區域、階段、視窗、Effect、builtins；三套驗收規則 | 規劃 |
| `modules/utils/docs/flow-and-architecture-plan.md` | 架構評估（A 部分）與日麻流程（B 部分） | B 部分是 RuleSet 的階段圖，不是核心程式碼 |
| `modules/utils/docs/game-design-review.md` | 目前 game 實作的問題：接線缺口（B1–B5）、邏輯 bug | **描述現況**，修正後要更新 |
| `spikes/kernel-bench/RESULTS.md` | 效能與記憶體量測（Go vs TS、QuickJS、Starlark、gRPC） | 量測數據；`spikes/` 不進 git，只在本機 |
| `modules/utils/docs/riichi-ruleset-roadmap.md` | 日麻規則模組的方向與路線圖 | 規劃 |
| `modules/utils/docs/game-flow.md` | 目前的回合狀態機 | 描述現況；開頭有警告 |
| `modules/game-server/src/classes/api_docs.md` | 插件開發手冊（現行 hook 名稱與回傳格式） | 部分約定已過時，見第 6 節 |
| `modules/utils/docs/architecture-extensibility.md` | 最早的擴充性決策 | 歷史；有更新註記 |
| `todo/docs/*.md` | 早期的後端／前端計畫 | 歷史；有「現況核對」 |

## 4. 已決定的事（決策紀錄）

| 日期 | 決定 | 依據 |
| :--- | :--- | :--- |
| 2026-11-05 | 語言維持 TypeScript | spike：Go 原生只快 1.2–1.3×；行程內 QuickJS 與遠端 runner 差 100× 以上 |
| 2026-11-05 | 插件在行程內 QuickJS 執行，不經過遠端 runner | 每次呼叫 17 µs vs 毫秒級 |
| 2026-11-06 | 移除 function-runner；執行併入 game-server，驗證併入 function-storage | 使用者決定。理由：減少服務數量 |
| 2026-11-06 | lobby 保留為 Edge / BFF，不轉發遊戲訊息 | 使用者說明的職責 |
| 2026-11-06 | 每局重建 context；插件狀態放在主機端 | 重放與同步；context 重建成本約 3.6 ms／局 |
| 2026-11-06 | NATS JetStream 作為對局日誌；先寫再套用；可單節點 | 使用者同意保留（成就、觀戰是備案） |
| 2026-11-06 | 日麻基本規則也是插件（預設模板庫） | 使用者決定 |
| 2026-11-06 | temp runner（dashboard、`/api/runner/execute`）依設計移除，不補路由 | 設計文件沒有此端點；function-runner 本來就要移除 |
| 2026-11-06 | `function-runner/deployment.yaml` 修復而不刪除 | 使用者決定；等 function-runner 移除時再刪 |
| 2026-11-06 | 日麻初版規則預設值採用 `riichi-ruleset-roadmap.md` 第 8 節的建議值（赤牌 3 張、喰い断允許、後付け允許、頭ハネ、25000 點、飛び終局、東風戰與半莊戰、三家和流局） | 使用者確認（"我說可以"）；都是 `RuleConfig` 參數，可以改 |
| 2026-11-06 | api-server 移除所有給人看的 HTML 頁（dashboard `/`、docs `/docs`），只保留 JSON API 與 `/health` | 使用者決定（"對人的部分移除掉"）；未知路徑回 JSON 404 |
| 2026-11-06 | `.gitignore` 加入整個 `spikes/` 目錄，不進 git | 使用者決定（"把測試用的程式放進 gitignore"）；文件中連到 `spikes/` 的路徑只在本機有效 |
| 2026-11-06 | 已 commit 並 push 到 `origin/dev` | 使用者明確要求；讓下一個 agent / human 能快速上手 |

## 5. 目前已完成的程式修正

- `function-storage/db/schema.ts`：`hooks` 的 `.notNull()` 放錯位置，改為 `.array().notNull()`；新增 migration `0001_soft_wallow.sql`（`SET NOT NULL`）。已在全新 PostgreSQL 18 與有資料的升級路徑測試通過。
- `game-server/src/grpc/handler.ts`：`listRoomPlugins` 改為回傳「未實作」，不再掛起。
- `game-server/src/sendMessage.ts`：`createRunnerServices` 改用傳入的 address。
- `game-server/Dockerfile`：`EXPOSE 4001`。
- `function-runner/index.ts`：`MinWorkers` 改用 `MIN_WORKERS`。
- `function-runner/src/utils/config.ts`、`helm/values-dev.yaml`：移除沒用到的 `FUNCTION_STORAGE_URL`。
- `helm/mahjong-system/values.yaml`：gRPC 埠修正；新增 `lobby-server`；新增 `migrations` 區塊（預設關閉）。`helm lint` 與兩份 values 的 `helm template` 都通過。
- `modules/proto/scripts/generate.ts` + `package.json`：`gen:proto` 改為依平台選擇 plugin（Windows 用 `.exe`）。Windows 與 Linux 容器的 Docker build 都已驗證。
- 刪除：`modules/utils/src/game/index.ts.bak`、`modules/utils/src/mahjong/game.proto`、`modules/proto/src/proto/NUL`、`services/NUL`。
- `README.md` 與各模組 README：改寫為現況說明，並加上「Planned change」。
- 2026-11-06：`function-runner/deployment.yaml` 修復（gRPC 4001、TCP 探測、移除未使用的 env 與 secret）；kubectl client dry-run 通過。
- 2026-11-06：`.gitignore` 加入整個 `spikes/` 目錄（`.gitignore` 目前只有這一行；先前列出的測試與 benchmark 檔名清單已被替換）。`spikes/` 不進 git。
- 2026-11-06：api-server 移除 HTML 頁：`index.ts` 的 `/`、`/index.html`、`/docs`、`/api-docs` 路由與 import，以及整個 `src/ui/`（dashboard、docs、apiReference）。`/health` 與 JSON API 不變；實際啟動驗證過 HTML 路徑回 JSON 404、`/health` 回 200。README 與根目錄 README 已同步。（dashboard 卡片與 JS、docs 頁、`apiReference.ts` 條目、`src/handler/runner.ts`、`src/utils/schemas.ts` 的 runner schema、`room.ts` 未用的 import）。dashboard 與 docs 頁渲染正常，script 語法通過；api-server tsc 只剩既有錯誤。

**還沒做的**（對應 design review 與 plugin-runtime-design 第 8 節的修改順序）：B1 牌山接線、B2–B5、SandboxHost、Worker 分片、JetStream 接入、function-storage 檢查管線、移除 function-runner、日麻模板庫。

## 6. 已知的過時或不一致

- `game-server/src/classes/api_docs.md`：寫「hook 必須同步」，這個在行程內 QuickJS 成立，但文件沒有說明重建 context 的規則；`onEvaluateHand` 等 hook 目前沒有接線（`calcScore` 沒有呼叫點）。
- `function-runner/deployment.yaml`：已修復（2026-11-06）：埠改為 gRPC 4001、探測改為 TCP、移除沒用到的 `FUNCTION_STORAGE_URL` 與 `API_KEY` secret。檔案仍是暫時的，等 function-runner 移除時一併刪除。
- `api-server` 的 dashboard 與 docs 頁、`apiReference.ts`、`src/handler/runner.ts`：已依設計移除 temp runner（2026-11-06）。設計文件沒有定義對應的端點，所以不補路由。
- `api-server/src/endpoints/roomManager.ts:140` 有既有的 TypeScript 錯誤（insert 的 `status` 欄位），與本次改動無關。
- `modules/function-storage/db/ER-diagram.md` 已修正 `hooks` 與 `default_store`；`versions` 的唯一索引名稱仍有誤導（`uq_versions_method_version_type` 不含 `resource_type`），未修。

## 7. 本機環境的坑（Windows + Git Bash）

- **不要在 repo 裡執行 `python`。** 這台機器的 `python` 指令會自動安裝一份 Python 到當前目錄（曾產生 167 MB 的 `Python/`，已刪除）。
- **Go 的執行檔在這台機器上會被 Application Control 擋下。** 用 Docker 跑：`docker run --rm -v "<spikes/kernel-bench>:/w" -w /w/go golang:1.26 sh -c "go vet ./... && go test ./..."`。若要在 Windows 直接跑 `go test`，需先設 `LOCALAPPDATA` 與 `GOCACHE`。
- **Windows 的時鐘解析度約 0.5 ms**，效能量測必須在 Linux 容器內做（`spikes/kernel-bench/results/*-linux-run*.json` 是這樣來的）。
- **Helm 不在 PATH。** 用完整路徑：`C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\Helm.Helm_Microsoft.Winget.Source_8wekyb3d8bbwe\windows-amd64\helm.exe`。
- **本機 Docker 上有別的專案的資料庫**：`engcard-test-db` 佔用 `55432`（pgvector pg18，使用者 `engcard`）。跑資料庫測試前先確認 port，測試用 `56543` 之類的其他 port。不要碰 `engcard*` 容器。曾經誤連到這個資料庫（認證失敗，沒有寫入），已確認沒有資料被改動。
- **`bun install` 在 spike 裡會略過 1 個 postinstall**（來源未確認），目前不影響測試與執行。
- **Docker build 需要 Linux 的 `gen:proto`**：已修好，但只在 game-server 的 image 上驗證過。

## 8. 驗證指令

```bash
# 規則與牌的 spike 測試
cd spikes/kernel-bench/ts && bun test                       # 14 pass
# Go 測試：見第 7 節（Docker）

# 型別檢查（每個模組）
cd modules/<name> && bunx tsc --noEmit -p tsconfig.json     # game-server, function-runner, function-storage, proto, lobby-server: 通過
                                                            # api-server: 1 個既有錯誤

# Helm
helm lint helm/mahjong-system
helm lint helm/mahjong-system -f helm/mahjong-system/values-dev.yaml
helm template mahjong helm/mahjong-system                   # 預設 values 也能渲染

# schema 與 migration 是否一致
cd modules/function-storage && bun run generate             # 應顯示 "No schema changes"

# proto 產生
bun run gen:proto                                           # 根目錄執行
```

**每次改動後應該跑的最小集合**：spike 的 bun test、受影響模組的 tsc、`bun run generate`（若改過 schema）。

## 9. 協作守則（使用者偏好）

- **回覆用繁體中文，簡潔。** 先給結論，再給細節。
- **明顯的選擇直接做，並在最後說明。** 非明顯的決定列出選項與建議，請使用者決定。
- **破壞性操作要先確認**：刪除有內容的檔案、`git commit`、`git push`、修改他人的資料庫。
- **使用者說「先測試再給結果」時**：跑完可以驗證的測試，逐一列出通過與失敗，沒測的項目要明講。
- **不要宣稱沒驗證的事為已完成。** 例如 Linux 上的 Docker build 只在 game-server 驗證過。

## 10. 未決的問題

1. 為什麼 game-server 要再拆出 Worker 子行程：目前是 Worker 內執行沙箱；若擔心沙箱拖垮 game-server，可以改子行程（成本未量測）。
2. 映像倉庫命名：Helm 用 `pikacnu/<name>`，CI 推到 `ghcr.io/<owner>/mahjong-<module>`。待定。
3. Go + Starlark 是否重新評估：只在單一 Pod 需要上萬局，或大量不等待的自我對弈時。
4. 未量測：builtin 跨沙箱邊界的成本、JetStream publish + ack 的延遲、Bun 上的 NATS 客戶端相容性、每個 Worker 能承載的局數。
