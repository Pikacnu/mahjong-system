# function-storage

gRPC service that stores plugin code, its versions, dependencies and plugin definitions in PostgreSQL. `function-runner` and `api-server` read from it.

## Service

Implements `mahjong.code_storage.v1.StorageService` (`modules/proto/src/proto/services/storage.proto`):

- `GetMethodInfo`: method metadata and its dependencies
- `GetPluginDefinition`: default store, dependencies and hook list for a plugin
- `GetResourcesVersions`: available versions of a function or module
- `GetResourcesData`: source code and hash for one version
- `StoreResources`: save code, version and dependencies
- `StorePluginDefinition`: save default store and hooks

Listens on `PORT` (default `3000`; `values-dev.yaml` and the Dockerfile use `4001`). Callers dial `GRPC_PORT`, so the two must match.

## Database

Drizzle schema `function_storage` in `db/schema.ts`:

- `resource`: code and hash
- `method`: method name and source type (`builtin` / `user`)
- `versions`: method × version × resource (`function` / `modules`)
- `dependencies`: version → version
- `plugin_definitions`: `default_store` (jsonb), `hooks` (text array), one row per version

See [`db/ER-diagram.md`](db/ER-diagram.md) for the relationships.

## Scripts

```bash
bun run generate   # drizzle-kit generate
bun run migrate    # drizzle-kit migrate (needs DATABASE_URL)
bun run start      # bun index.ts
```

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | gRPC listen port |
| `DATABASE_URL` | — | PostgreSQL connection (required) |

## Notes

- `index.ts` has a commented-out HTTP server (`/builtin-modules`); the service is gRPC-only today.

## Planned change

Per [`plugin-runtime-design.md`](../utils/docs/plugin-runtime-design.md) (section 5), function-storage takes over plugin validation from function-runner. Each upload is queued and checked in a resource-limited subprocess: type-check against the plugin SDK, transpile to JS, static checks (no `Date`, `Math.random`, `eval`, `Function`), load in the sandbox, and run test games (invariants, determinism, hidden-state check). Only builds that pass are stored, by hash.
