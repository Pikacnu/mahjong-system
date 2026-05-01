# Demo endpoints (temporary)

檔案生成：自動新增 — 用於紀錄在開發或 demo 中暫時存在的端點，必須標註為可刪除或僅供展示用途。

目的：記錄目前倉庫中為了展示或 smoke-test 而暫時保留的 HTTP/gRPC 端點、表單、或 UI 按鈕，並提醒開發者在生產/正式發佈前移除或轉為受控開發旗標。

目前已知的 demo 端點：

- `GET /api/runner/execute` (usage) — 提供臨時說明用的 GET 回應，示範如何呼叫 POST。用途：文件與快速示範。狀態：臨時，請在 production release 前移除或改為驗證保護。
- `POST /api/runner/execute` — 臨時 function-runner smoke-test 路由；會選擇性儲存 code 並呼叫 function-runner。用途：本地驗證 function-runner pipeline。狀態：臨時，僅作 demo/測試用途，請在合併前加上審核或刪除標記。

建議流程：

- 所有 demo-only endpoints 必須在檔頭或 docs 中註明「Temporary / Demo only」。
- 若需要長時間保留，請加入 feature-flag 或 BasicAuth，並於部署前移除或改為 internal-only。
- 指派 owner 與移除截止日（例如：`owner: api-team, remove-by: 2026-06-01`）。

範例 TODO 條目（可用於追蹤移除）：

- [ ] 將 `/api/runner/execute` 改為受限的 internal-only 或 feature-flag。 (owner: api-server)
- [ ] 在下次 major release 前移除上述 demo route。 (owner: api-server)

---

此檔案由 AI 協助建立；如需我把相關 TODO 也加入 repo 的 Issue tracker 或 PR 描述，請告訴我。
