# utils

Shared code used by every service: configuration, Mahjong types, plugin interfaces, the response envelope and web and websocket helpers.

## Layout

- `src/config.ts`: environment defaults (`PORT`, `GRPC_PORT`, `BIND_HOST`, service hostnames). See the port contract in the [root README](../README.md#port-and-hostname-contract).
- `src/mahjong/type.ts`: tiles, `PlayerAction`, and the round and game status enums
- `src/interfaces/`: plugin types. `plugin.ts` defines `PluginInstance`, `LifecycleHookType`, `DecisionHookType` (also exported as `ActionHookType`) and the manifest schemas. `score-calc.ts` holds scoring types.
- `src/response.ts`: `ApiResponse<T>` and `ApiError` helpers
- `src/utils.ts`: `encodeToBytes` / `decodeFromBytes` (JSON to bytes for protobuf `bytes` fields), `shuffleArray`, `sleep`
- `src/web/`: `createWebHandler`, a wrapper around `Bun.serve` that listens on `PORT` and `HOSTNAME` and takes a route table and websocket handlers
- `src/websocket/`: room event helpers
- `docs/`: [architecture-extensibility.md](docs/architecture-extensibility.md) and [game-flow.md](docs/game-flow.md)
