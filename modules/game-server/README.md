# game-server

Runs Mahjong games. Holds game state in memory (no database), loads rule plugins, and exposes the room API over gRPC.

## Service

Implements `mahjong.game_server.v1.RoomServices` (`modules/proto/src/proto/services/room.proto`):

| RPC | Status |
| :--- | :--- |
| `CreateRoom` | Implemented |
| `SendRoomEvent` | Implemented |
| `SubscribeRoomEvents` (server stream) | Implemented |
| `GameChannel` (bidirectional stream, used by lobby-server) | Implemented |
| `AddRoomPlugin` / `RemoveRoomPlugin` | Implemented |
| `ListRoomPlugins` | Returns `success: false` with "not implemented" (plugin management is WIP, like `AddRoomPlugin` and `RemoveRoomPlugin`) |

Listens on `GRPC_PORT` (default `4001`).

## Code map

- `index.ts`: wires the gateways and starts the gRPC server
- `src/manager/gameInstanceManager.ts`: owns all live games (`GameInstanceManager`)
- `src/classes/game.ts`: `Game`, players and the round lifecycle
- `src/classes/round.ts`: `Round`, the turn state machine (`RoundStart` → `PlayerGetsTile` → `WaitingForPlayerAction` → `ResolvingPlayerAction` → `RoundEnd`), timeouts and scoring
- `src/classes/table.ts`, `player.ts`, `tils.ts`: table, hand and tile models
- `src/classes/connectionManager.ts`: per-room connections
- `src/plugins/plugin-manager.ts`: loads plugins, runs hooks by priority, stores plugin state
- `src/classes/gateway.ts`, `src/grpc/gateways.ts`: clients for function-storage and function-runner
- `src/classes/api_docs.md`: plugin developer manual (hooks, patches, storage)

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `GRPC_PORT` | `4001` | gRPC listen port |
| `STORAGE_HOSTNAME` | `storage-service` | function-storage host (dialed on `GRPC_PORT`) |
| `PLUGIN_RUNNER_HOSTNAME` | `plugin-runner-service` | function-runner host (dialed on `GRPC_PORT`) |

## Scripts

```bash
bun run index.ts
```

## Notes

- Game state is lost on restart. Snapshot and replay are planned, see [`todo/docs/backend-implementation-plan.md`](../../todo/docs/backend-implementation-plan.md).

## Planned change

Per [`plugin-runtime-design.md`](../utils/docs/plugin-runtime-design.md), game-server takes over plugin execution from function-runner:

- The main thread only handles connections, ticket checks and routing; it never runs plugin code.
- K game Workers each own a shard of games. Each game has one QuickJS runtime, and each plugin gets a context that is rebuilt at the start of every hand.
- Player inputs are written to NATS JetStream before they are applied, so a crashed Worker's games can be replayed from the log.
