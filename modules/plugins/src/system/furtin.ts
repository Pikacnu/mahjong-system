import {
  DecisionHookType,
  PluginHookCategory,
  PluginHookMode,
  type PluginInstance,
  type PluginHookResult,
  type PluginHookPayloads,
  type PluginHookDefinition,
  PlayerAction,
} from 'utils';

/**
 * Furtin (振聽) plugin
 * - Purpose: track simple furiten state per player and prevent `Ron` when
 *   furiten is detected.
 * - Notes: Full furiten detection (winning tile enumeration) requires a
 *   hand-evaluation/scoring engine. This plugin implements a conservative
 *   tracking approach and documents integration points for the game logic.
 *
 * Integration guidance:
 * - The game should pass the current discarded tile(s) via
 *   `EvaluateAvailableActions` payload (property `discardedTiles`) so the
 *   plugin can update per-player discard history and compute furiten.
 * - When a player actually discards a tile, calling the plugin `ResolveAction`
 *   hook with a payload containing the discarded tile(s) will allow the
 *   plugin to persist discard history in its storage.
 */

type FuritenStorage = {
  // map playerId -> boolean
  playerFuriten: Record<string, boolean>;
  // map playerId -> list of discarded tile keys (simple serialization)
  playerDiscardHistory: Record<string, string[]>;
};

const defaultStore: FuritenStorage = {
  playerFuriten: {},
  playerDiscardHistory: {},
};

function tileToKey(tile: unknown): string {
  if (!tile || typeof tile !== 'object') return String(tile);
  // Common shapes in this repo: { type, index } or { suit, id }
  // Fall back to JSON string if uncertain.
  const t: any = tile;
  if ('type' in t && 'index' in t) return `${t.type}:${t.index}`;
  if ('suit' in t && 'id' in t) return `${t.suit}:${t.id}`;
  try {
    return JSON.stringify(t);
  } catch (err) {
    return String(t);
  }
}

const EvaluateAvailableActions = async (
  context: PluginHookPayloads[DecisionHookType.EvaluateAvailableActions],
) => {
  const { payload, playerId, storage } = context as any;
  if (!playerId) return undefined;

  // Defensive: payload may include `discardedTiles` (Set) or `discardedTile`.
  const discardedTiles: unknown[] = [];
  if (payload && (payload as any).discardedTiles) {
    const ds = (payload as any).discardedTiles;
    if (ds instanceof Set) {
      for (const d of ds) discardedTiles.push(d);
    } else if (Array.isArray(ds)) {
      discardedTiles.push(...ds);
    }
  }
  if ((payload as any).discardedTile)
    discardedTiles.push((payload as any).discardedTile);

  if (discardedTiles.length === 0) {
    // nothing to update; do not block or alter actions
    return undefined;
  }

  storage.playerDiscardHistory = storage.playerDiscardHistory || {};
  storage.playerFuriten = storage.playerFuriten || {};

  // Record latest discards for this player (append keys)
  const hist = storage.playerDiscardHistory[playerId] || [];
  for (const t of discardedTiles) {
    const k = tileToKey(t);
    // avoid unbounded growth: keep recent 20
    if (!hist.includes(k)) hist.push(k);
  }
  storage.playerDiscardHistory[playerId] = hist.slice(-20);

  // Simple furiten heuristic:
  // - if the currently discarded tile matches any tile the player has previously discarded,
  //   mark furiten = true. This is a conservative heuristic and should be replaced with
  //   a full-winning-tile analysis when integrating a scoring engine.
  const curKeys = new Set(discardedTiles.map(tileToKey));
  const wasFuriten = (storage.playerFuriten[playerId] as boolean) || false;
  let nowFuriten = wasFuriten;
  for (const k of hist) {
    if (curKeys.has(k)) {
      nowFuriten = true;
      break;
    }
  }
  storage.playerFuriten[playerId] = nowFuriten;

  return undefined;
};

const ValidateAction = async (context: any) => {
  const { payload, playerId, storage } = context as any;
  if (!playerId) return undefined;
  const action: PlayerAction | undefined = (payload as any).action;
  if (action === PlayerAction.Ron) {
    const furiten = !!(storage.playerFuriten || {})[playerId];
    if (furiten) {
      // Reject Ron when furiten is detected
      const out: PluginHookResult<FuritenStorage> = { reject: true };
      return out;
    }
  }
  return undefined;
};

const ResolveAction = async (context: any) => {
  // Optional: when the game calls ResolveAction for a discard-like action,
  // plugin may record the discard in storage. Not all flows call ResolveAction
  // for discard events; EvaluateAvailableActions handler above is the primary
  // integration point for updating discard history.
  const { payload, playerId, storage } = context as any;
  if (!playerId) return undefined;
  // Example: if payload contains `discardedTile` then append to history
  if ((payload as any).discardedTile) {
    storage.playerDiscardHistory = storage.playerDiscardHistory || {};
    storage.playerDiscardHistory[playerId] = (
      storage.playerDiscardHistory[playerId] || []
    ).concat([tileToKey((payload as any).discardedTile)].slice(-20));
  }
  return undefined;
};

export const FurtinPlugin: PluginInstance<FuritenStorage> = {
  manifest: {
    id: 'system.furtin',
    name: 'Furtin / Furiten rule',
    version: '0.1.0',
    description:
      'Basic furiten tracking plugin. Prevents Ron if player is marked furiten.',
  },
  defaultStore,
  runtime: {
    // no live runner required for this simple plugin
    defaultState: {},
  },
  implementation: {
    decision: {
      [DecisionHookType.EvaluateAvailableActions]:
        EvaluateAvailableActions as any,
      [DecisionHookType.ValidateAction]: ValidateAction as any,
      [DecisionHookType.ResolveAction]: ResolveAction as any,
    },
  },
  usedGlobalStorageKeys: [],
  globalStorageDefaultValues: {},
  hooks: [
    {
      type: DecisionHookType.EvaluateAvailableActions,
      category: PluginHookCategory.Decision,
      mode: PluginHookMode.Query,
    },
    {
      type: DecisionHookType.ValidateAction,
      category: PluginHookCategory.Decision,
      mode: PluginHookMode.Command,
    },
    {
      type: DecisionHookType.ResolveAction,
      category: PluginHookCategory.Decision,
      mode: PluginHookMode.Command,
    },
  ] as PluginHookDefinition[],
};

export default FurtinPlugin;
