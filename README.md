# Mahjong System

A Bun + TypeScript microservices template for building a Mahjong game platform. This repository contains modular services, a Postgres-backed storage service with Drizzle ORM support, Helm charts for Kubernetes deployment, and CI automation for building and publishing container images. The project is designed to serve as a minimal demo and a developer-friendly local environment using Kind.

Key features

- Modular services: `api-server`, `game-server`, `lobby-server`, `function-runner`, `function-storage`, `plugins`, `proto`, `utils`.
- Dockerfiles for each module and a helper script to build and load images into a local Kind cluster.
- Helm chart (`helm/mahjong-system`) with Postgres initialization and an optional migration Job template.
- Postgres initialization scripts and support for Drizzle migrations.
- GitHub Actions workflow to build and push module images to a container registry.

Project architecture (high level)

- `api-server`: HTTP / gRPC API layer and entrypoint for clients.
- `game-server`: real-time game logic, message routing and game state management.
- `lobby-server`: matchmaking, session lifecycle and player presence.
- `function-runner`: sandboxed execution environment for user-defined functions.
- `function-storage`: persistent storage for functions/plugins and related metadata (Postgres + Drizzle ORM).
- `plugins`: plugin host and example plugins.
- `proto`: protocol buffer definitions and generated code.
- `utils`: shared utilities and types used across modules.

Current status

The project is under active development. Several components are partially functional and suitable for small demonstrations, while others remain in progress. Below is a concise per-module status:

- **api-server**: Partially functional — core API endpoints are available for demo use; overall coverage is limited.
- **game-server**: Partially functional — core game-system implemented for some gameplay flows; many features still in progress.
- **lobby-server**: Partially functional — basic matchmaking and session handling exist but are not feature-complete.
- **plugins**: Incomplete — the `plugins` directory is intended as the system plugin host but is still being developed.
- **function-storage**: Work in progress — DB schema, `drizzle.config.ts`, and migration scaffolding are present.
- **function-runner**: Work in progress — runner scaffolding exists; further hardening and features required.
- **proto**: Work in progress — protocol buffers and generated code are present.
- **utils**: Work in progress — shared utilities used across modules.

Notes

- The repository can run a minimal demo: enable Postgres and run `scripts/kind-build-and-deploy.sh` to build and deploy local images to a Kind cluster.
- The plugin system and several advanced features are still incomplete; contributions are welcome to stabilize and extend functionality.


Development environment (summary)

Prerequisites

- Docker
- kind (Kubernetes in Docker)
- kubectl
- helm (v3+)
- bun (for local development and builds)
- git

Examples (concise)

- Build module images, load them into the local Kind cluster, and deploy the Helm chart (dev values):

```bash
bash scripts/kind-build-and-deploy.sh
```

- Deploy the Helm chart using the repository dev values (uses local images and Postgres init scripts):

```bash
helm upgrade --install mahjong-system helm/mahjong-system -f helm/mahjong-system/values-dev.yaml --wait --timeout 300s
```

- Run Drizzle migrations from the `function-storage` module (example):

```bash
cd modules/function-storage
# using bunx or equivalent to run drizzle-kit
bunx drizzle-kit push --config ./drizzle.config.ts
```

Build and production notes

- Each module's `Dockerfile` uses Bun and runs `bun install` followed by `bun build` when a build script exists. CI can also produce production images.
- The repository includes a CI workflow at `.github/workflows/ci-build.yml` that builds and pushes module images to a registry (GitHub Container Registry by default).

Database and migrations

- Initial SQL setup is available at the repository root (`init.sql`) and is included in the Helm dev values as `postgresql.initdbScripts`.
- The Helm chart includes an optional migration Job template at `helm/mahjong-system/templates/migration-job.yaml`. To run migrations via Helm, enable the `migrations` section in `helm/mahjong-system/values-dev.yaml` and configure `migrations.image` and `migrations.command`.

Important paths

- Helm chart: `helm/mahjong-system`
- Dev Helm values: `helm/mahjong-system/values-dev.yaml`
- Migration Job template: `helm/mahjong-system/templates/migration-job.yaml`
- Kind build & deploy script: `scripts/kind-build-and-deploy.sh`
- CI workflow: `.github/workflows/ci-build.yml`
- Drizzle config (function-storage): `modules/function-storage/drizzle.config.ts`
- Module Dockerfiles: `modules/*/Dockerfile`

Contributing

- Open issues and PRs for bugs, enhancements, or documentation improvements.
- To add a new module, create a folder under `modules/` with `package.json`, an entry file (e.g. `index.ts`), and a `Dockerfile`, then add the service to the Helm values if you want it deployed by the chart.

License

Check the repository for a `LICENSE` file or the repository settings for licensing information.

Maintainers / contact

Repository owner: Pikacnu

---
If you want this README to include badges, a short API reference, or a short developer checklist (for example, common `bun build` flags or Windows-specific notes), tell me which sections to expand and I will update the file.
