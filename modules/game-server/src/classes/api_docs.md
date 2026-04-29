# Mahjong Game Engine: Plugin Developer's Manual (v2.2)

This guide provides technical specifications for extending the Mahjong Game Engine via plugins.

---

## 1. Core Principles

### Synchronicity & Determinism
**CRITICAL**: All hook implementations MUST be strictly synchronous. While the interface is `Promise`-based (to maintain compatibility with the engine's async runner), plugin code should never use `await`, `setTimeout`, or perform any I/O. All decisions must be made instantly using the provided `context`.

### Global Storage
Plugins share state through a unified **Global Storage**.
- **Declaration**: Declare dependencies in `usedGlobalStorageKeys`.
- **Consumption**: Access values via `context.storage[key]`.
- **Mutation**: Update values using `storagePatch` of type `Global`.

---

## 2. Updated Orchestration (Priorities)

| Priority | Layer | Description |
| :--- | :--- | :--- |
| **150** | **State Reset** | Resets round-specific flags in `onRoundStart`. |
| **100** | **Validators** | **`onValidateAction`**: Rejects specific illegal actions (e.g., Ron in Furiten). |
| **50** | **Action Resolvers**| **`onResolveAction`**: Updates state/scores based on accepted actions. |
| **0** | **Standard Rules** | Fallback behaviors and basic game mechanics. |

---

## 3. The Validation Hook (`onValidateAction`)

This hook is triggered in the `ResolvingPlayerAction` state **before** any logic is applied.

- **Purpose**: To allow plugins to veto a player's action choice.
- **Payload**: Contains the `action` and `playerId`.
- **Impact**: If any plugin returns `reject: true`, the engine ignores the action and stays in the same state (waiting for a valid action).

---

## 4. Practical Patterns

### Pattern: Furiten (Veto Logic)
1.  **`onResolveAction` (Discard)**: Detects if the player is in Furiten and updates the global `furitenStatus` map.
2.  **`onValidateAction`**: If the incoming action is `Ron` and the player is in `furitenStatus`, return `reject: true`.

### Pattern: Riichi (Enforcement Logic)
1.  **`onEvaluateAvailableActions`**: If the player is already in `riichiStatus`, return `pluginAction: [PlayerAction.DrawTile]` and set `stopPropagation: true`. This forces the engine to only accept a discard action.
2.  **`onResolveAction` (Riichi)**: Applies the `-1000` point penalty and sets the global `riichiStatus` flag.

---

## 5. Technical Reference

### Hook Results Summary
- **`reject`**: Vetoes the current engine operation (Critical for validation).
- **`stopPropagation`**: Prevents subsequent plugins from seeing the hook.
- **`gameStatsPatch`**: Mutates player scores or hand tiles.
- **`storagePatch`**: Updates private or global storage.
- **`pluginAction`**: Injects new actions or evaluation metadata.
