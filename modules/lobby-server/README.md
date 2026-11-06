# lobby-server

Client-facing gateway. Players connect over WebSocket, the lobby checks the game through `api-server`, then relays room events from `game-server`.

## Endpoints

| Path | Purpose |
| :--- | :--- |
| `GET /health` | Health check |
| `GET /ws?playerId=<id>` (WebSocket upgrade) | Player connection. `playerId` is required (400 without it). Each socket subscribes to the topic `player_<playerId>`. |

## Message flow

1. The client sends a JSON message. `src/utils/index.ts` validates it.
2. For `PlayerConnected`, the lobby calls `GET {API_URL}/api/game/management?gameId=` and checks that the player is in `playerInfo`.
3. It opens a `GameChannel` to game-server (`src/grpc/gameServer.ts`, `createGameChannel`).
4. Room events from game-server are published to the topic `game_<gameId>`.

## Code map

- `index.ts`: HTTP and WebSocket handlers
- `src/grpc/gameServer.ts`: gRPC client for game-server (`gameServices`, `createGameChannel`)
- `src/classes/playerConnectionManager.ts`: player connection bookkeeping
- `src/utils/index.ts`: message validation

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP and WebSocket port (`values-dev.yaml` uses `3001`) |
| `API_URL` | `http://localhost:30000` | api-server base URL for game checks |
| `GAME_SERVER_HOSTNAME` / `GRPC_PORT` | `game-server-service` / `4001` | game-server address |

## Notes

- The lobby's gRPC client types come from the `proto` workspace package. `modules/proto/src/proto/services/lobby.proto` is an empty placeholder.
