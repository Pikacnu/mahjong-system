# plugins

Built-in rule plugins and shared Mahjong calculation tools.

## Layout

- `src/system/furtin.ts`: Furiten (振聽) rule plugin, exported as `FurtinPlugin`. Tracks discard history and rejects `Ron` for a furiten player. Uses `defaultStore`, `hooks` and `implementation.decision`.
- `src/tools/mahjong.ts`: `MahjongTools` (tile sorting and related helpers). These are required to stay synchronous.
- `index.ts`: re-exports `src/tools/mahjong` only. Add plugin exports here if other modules need them.

## Plugin shape

A plugin is a `PluginInstance` from `utils` (`modules/utils/src/interfaces/plugin.ts`):

- `name`, `version`, `description`
- `defaultStore`: initial per-plugin storage (stored as jsonb)
- `hooks`: `{ type, category, mode }` entries, such as `onEvaluateAvailableActions` (query), `onValidateAction` and `onResolveAction` (command)
- `implementation`: hook handlers, grouped by `lifecycle` or `decision`
- `usedGlobalStorageKeys` / `globalStorageDefaultValues`: shared storage the plugin reads or writes

Hook rules and result fields (`reject`, `stopPropagation`, `pluginAction`, `storagePatch`, `gameStatsPatch`) are documented in [`game-server/src/classes/api_docs.md`](../game-server/src/classes/api_docs.md).

## Scripts

```bash
bun run build   # tsc type-check only (--noEmit); nothing is emitted
```

## Notes

- `build` does not write any output. The services consume these files directly.
