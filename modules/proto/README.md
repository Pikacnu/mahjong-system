# proto

Protocol Buffer contracts for all gRPC traffic between services, and the TypeScript code generated from them.

## Sources

- `src/proto/common.proto`: `ApiError` envelope and `ErrorCode`, used in every response
- `src/proto/services/room.proto`: `RoomServices` (game-server)
- `src/proto/services/runner.proto`: `RunnerService` (function-runner)
- `src/proto/services/storage.proto`: `StorageService` (function-storage)
- `src/proto/services/lobby.proto`: empty placeholder

Responses report errors in-band: `success: false` plus an `error` field. Services do not use gRPC status codes for business errors.

## Generated code

`src/generated/` is gitignored. Regenerate it from the repository root:

```bash
bun run gen:proto
```

`scripts/generate.ts` runs `protoc` with `ts-proto` (`outputServices=grpc-js`, `useOptionals=messages`). `protoc` must be on `PATH`. The script picks the plugin binary for the platform (`.exe` on Windows, no extension elsewhere).

`index.ts` exports the generated namespaces (`MahjongCommonV1`, `MahjongRoomV1`, `MahjongRunnerV1`, `MahjongCodeStorageV1`, `MahjongLobbyV1`) and the client helpers in `src/client/`.

## Notes

- The previous script pointed `--plugin` at `protoc-gen-ts_proto.cmd`, which does not exist on Windows (only `.exe`) or Linux. `scripts/generate.ts` replaces it. Verified on Windows; the Linux path is the same code with no `.exe` suffix and has not been run here.
