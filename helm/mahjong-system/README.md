Mahjong System Helm chart

This helm chart deploys core services used by the mahjong-system project:

- function-storage
- function-runner
- game-runner (maps to modules/game-server)
- api-server
- PostgreSQL database

Quickstart:

1. Edit images/credentials in `values.yaml`.
2. Install with Helm:

```bash
helm install mahjong ./helm/mahjong-system
```

3. Upgrade after changes:

```bash
helm upgrade mahjong ./helm/mahjong-system -f values.yaml
```

If you want me to wire real image names (from your CI registry) or add Ingress, tell me the image repository names and any required env variables.

## Initializing PostgreSQL with scripts

You can provide initialization scripts that will be mounted into the PostgreSQL container at `/docker-entrypoint-initdb.d` by setting `postgresql.initdbScripts` in `values.yaml`.

Example in `values.yaml`:

```yaml
postgresql:
  initdbScripts:
    01-init-schema.sql: |-
      -- SQL initialization example (executed by POSTGRES_USER)
      CREATE USER docker;
      CREATE DATABASE docker;
      GRANT ALL PRIVILEGES ON DATABASE docker TO docker;
```

Notes and alternatives:

- ConfigMap mount (implemented): mounts your scripts into `/docker-entrypoint-initdb.d` so the official Postgres entrypoint will execute them on first initialization (when data dir is empty).
- If your PV already contains an initialized database, these scripts will NOT run. To handle existing PVs consider:
  - Running a one-off `Job` or `kubectl exec`/`psql` to apply migrations.
  - Using an `initContainer` or separate `Job` to copy a preseeded data file into the PVC before Postgres starts.
  - Building a custom Postgres image that embeds the initialization scripts.

Commands:

Create a local kind cluster (uses scripts in root `package.json`):

```bash
bun run cluster:create
```

Delete the cluster:

```bash
bun run cluster:delete
```

Install the chart:

```bash
bun install mahjong ./helm/mahjong-system -f helm/mahjong-system/values.yaml
```

If you want, I can also add an example `Job` to apply scripts to an existing DB or provide an `initContainer` example to prepopulate the PVC—要哪個？
