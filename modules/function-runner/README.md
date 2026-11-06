# function-runner

gRPC service that executes plugin code in a pool of QuickJS workers and keeps long-lived "live modules" whose state persists between calls.

## Service

Implements `mahjong.runner.v1.RunnerService` (`modules/proto/src/proto/services/runner.proto`):

- `RunFunction`: run a stored function once
- `CreateLiveModule`: start a live module and return its `module_id`
- `CallLiveModuleFn`: call a function on a live module
- `RemoveLiveModule`: stop a live module
- `SetLiveModuleValue` / `GetLiveModuleValue`: read and write module state

Listens on `PORT` (default `3000`; `values-dev.yaml` uses `4001`). Callers dial `GRPC_PORT`, so the two must match.

## Components

- `src/manager/workerManager.ts`: worker pool and task queue (`WorkerManager`, `TaskQueue`)
- `src/manager/moduleManager.ts`: loads code from function-storage (`ModuleManager`)
- `src/manager/liveModuleManager.ts`: live module lifecycle (`LiveModuleManager`)
- `src/utils/cacher.ts`: in-memory code cache (`CodeCacher`)
- `src/utils/vm.ts`: QuickJS sandbox (`VM`, `durableVM`)

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | gRPC listen port |
| `FUNCTION_STORAGE_URL` | — | Not used; function-storage is reached through `STORAGE_HOSTNAME` and `GRPC_PORT` |
| `STORAGE_HOSTNAME` / `GRPC_PORT` | `storage-service` / `4001` | Where function-storage is dialed |
| `WORKER_MEMORY_LIMIT` | 24 MiB | Per-worker memory limit |
| `TASK_TIMEOUT_MS` | `5000` | Task timeout |
| `VM_MAX_STACK_SIZE` | 1 MiB | QuickJS stack size |
| `VM_EXECUTION_TIMEOUT_MS` | `5000` | Script execution timeout |
| `MAX_WORKERS` | `8` | Worker pool maximum |
| `MIN_WORKERS` | `1` | Worker pool minimum, started at boot |
| `MAX_TASKS_PER_WORKER` | `1` | Tasks per worker |
| `RELOAD_BUILTIN_INTERVAL` | `300000` | Read but currently unused |
| `API_KEY` | — | Only checked by `src/web/middleware.ts`, which is not wired up |

## Scripts

```bash
bun run start   # bun run index.ts
bun run dev     # bun --watch run index.ts
```

## Notes

- Dockerfile `EXPOSE 4001`; the default `PORT` is `3000`.

## Known limitations

- `LiveModuleManager.getInstance()` creates a pool of 2 Workers, and each live module holds a whole Worker until `RemoveLiveModule`. A third concurrent live module fails with `No idle worker available`.
- `RunFunction` creates a new QuickJS context and recompiles the code on every call (`src/utils/vm.ts`), about 357 µs per call versus 17 µs with a reused context (see `spikes/kernel-bench/RESULTS.md`).
- The interrupt counter in `getQuickJsRuntime` (`src/utils/vm.ts`) is shared by the whole runtime and never reset. After 1000 cumulative interrupt checks, every later execution in that Worker is interrupted.

## Planned change

**To be removed.** Per [`plugin-runtime-design.md`](../utils/docs/plugin-runtime-design.md), plugin execution moves into game-server (K game Workers, each owning a shard of games, one QuickJS runtime per game, contexts rebuilt per hand), and upload-time type-checking, build and conformance tests move into function-storage. The service, its Helm entry, `runner.proto` and its CI build will then be deleted.
