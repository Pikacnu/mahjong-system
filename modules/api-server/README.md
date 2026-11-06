# api-server

HTTP JSON API for the platform: game, room, player and plugin management. It is the only service besides `function-storage` that uses PostgreSQL. It serves no HTML pages; the human-facing dashboard and API docs were removed (2026-11-06).

## Routes

| Path | Methods | Purpose |
| :--- | :--- | :--- |
| `/health` | GET | Health check |
| `/api/game/management` | GET (`?gameId=`), POST | Game records and status |
| `/api/room/management` | GET (`?gameId=`), POST | Creates a room, then calls `createRoom` on game-server |
| `/api/player/management` | GET (`?playerId=`), POST | Players |
| `/api/plugin/management` | GET (`?name=&version=`), POST | Plugin definitions (stored via function-storage) |
| `/api/plugin/resource` | GET (`?name=&version=&resourceType=`), POST | Plugin code (stored via function-storage) |

Unknown paths return a JSON `404`.

The WebSocket handler in `index.ts` is an echo placeholder.

## Layout

- `index.ts`: route table, startup migration (`runMigrate()`).
- `db/`: Drizzle client (`index.ts`), schema (`schema.ts`, schema name `api-server`), migrator.
- `src/endpoints/`: request handlers per route.
- `src/handler/`: gRPC clients for `game-server` (`room.ts`) and `function-storage` (`storage.ts`).
- `src/utils/schemas.ts`: Zod request schemas.

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `GRPC_PORT` | `4001` | Port used to dial all gRPC services |
| `GAME_SERVER_HOSTNAME` | `game-server-service` | game-server host |
| `STORAGE_HOSTNAME` | `storage-service` | function-storage host |

## Scripts

```bash
bun run generate   # drizzle-kit generate (create a migration from schema.ts)
bun run migrate    # drizzle-kit migrate
```

The server also runs pending migrations on startup.

## Known gaps

- `roomPluginManager.ts` `POST` is an empty stub.
- The `game_logs_queue` and `game_snapshots` tables exist in `db/schema.ts`, but no code reads or writes them yet.

See [`../utils/docs/architecture-extensibility.md`](../utils/docs/architecture-extensibility.md) for the plugin model.
