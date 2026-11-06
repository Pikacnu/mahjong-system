# Mahjong System Helm chart

Deploys the mahjong-system services and a PostgreSQL instance.

| Service | Chart key | Source module | Ports (dev values) |
| :--- | :--- | :--- | :--- |
| api-server | `api-server` | `modules/api-server` | HTTP 3000, NodePort 30000 |
| lobby-server | `lobby-server` | `modules/lobby-server` | HTTP 3001 |
| game-server | `game-runner` | `modules/game-server` | gRPC 4001 (`grpcPort`) |
| function-storage | `function-storage` | `modules/function-storage` | gRPC 4001 (`port`) |
| function-runner | `function-runner` | `modules/function-runner` | gRPC 4001 (`port`) |
| PostgreSQL 18 | `postgresql` | — | 5432 |


## Quick start (local kind cluster)

From the repository root:

```bash
bun run cluster:create                  # kind cluster "mahjong-system" with NodePorts 30000 and 30001

# Build and load local images (tags must match values-dev.yaml: local/mahjong-<module>:dev)
docker build -f modules/api-server/Dockerfile -t local/mahjong-api-server:dev .
docker build -f modules/lobby-server/Dockerfile -t local/mahjong-lobby-server:dev .
docker build -f modules/game-server/Dockerfile -t local/mahjong-game-server:dev .
docker build -f modules/function-storage/dockerfile -t local/mahjong-function-storage:dev .
docker build -f modules/function-runner/dockerfile -t local/mahjong-function-runner:dev .
for img in api-server lobby-server game-server function-storage function-runner; do
  kind load docker-image local/mahjong-$img:dev --name mahjong-system
done

helm install mahjong ./helm/mahjong-system -f helm/mahjong-system/values-dev.yaml
```

Upgrade after changes:

```bash
helm upgrade mahjong ./helm/mahjong-system -f helm/mahjong-system/values-dev.yaml
```

Delete the cluster:

```bash
bun run cluster:delete
```

## Values

- `values.yaml`: production-style defaults. Images point to `pikacnu/<name>:latest` on Docker Hub. Set your own repositories and credentials before installing.
- `values-dev.yaml`: local kind setup. Uses `local/mahjong-*:dev` images, NodePort services, per-service env (`BIND_HOST`, `PORT`, runner limits), PostgreSQL init scripts, and enables `lobby-server`.

The CI workflow publishes images to `ghcr.io/<owner>/mahjong-<module>`. Point the `image.repository` values at those names when deploying from CI.

### Ports

The chart sets `PORT` to the service's `port` (unless `env` overrides it) and `GRPC_PORT` to `grpcPort` (default `4001`). Clients dial `<service>:GRPC_PORT`, so each gRPC service must listen on the port its callers use:

- `game-runner` (game-server) binds `GRPC_PORT`, so set `grpcPort: 4001`.
- `function-storage` and `function-runner` bind `PORT`, so set `port: 4001`.

Both `values.yaml` and `values-dev.yaml` follow these rules.

### Migrations

`function-storage` and `api-server` run their Drizzle migrations at startup, so the migration Job (`migrations.enabled`) is off by default in both files. Enable it only if you want a separate migration step, and set `migrations.command` to something that exists in the image.

## Initializing PostgreSQL with scripts

Scripts in `postgresql.initdbScripts` are mounted into `/docker-entrypoint-initdb.d` and run by the official Postgres image. They only run when the data directory is empty, so they do not run against an existing PersistentVolume.

```yaml
postgresql:
  initdbScripts:
    01-init-schema.sql: |-
      CREATE USER docker;
      CREATE DATABASE docker;
      GRANT ALL PRIVILEGES ON DATABASE docker TO docker;
```

For an existing database, run the SQL with `kubectl exec ... psql`, or use a one-off Job.

The repository's `init.sql` creates the `code-storage`, `mahjong-base` and `mahjong-game` databases and users. `values-dev.yaml` includes equivalent scripts.
