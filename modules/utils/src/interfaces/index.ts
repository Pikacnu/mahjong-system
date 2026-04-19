import type { GameSnapshot, MahjongTile, PlayerAction } from '../mahjong/type';

// Mirrors storage.proto::MethodInfo
export type MethodInfo = {
  name: string;
  version: number;
};

// Mirrors storage.proto::ResourceSource
export enum ResourceSource {
  BUILTIN = 'BUILTIN',
  USER = 'USER',
}

export enum PluginCapability {
  Lifecycle = 'lifecycle',
  Decision = 'decision',
  Query = 'query',
  Command = 'command',
  Stateful = 'stateful',
}

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  capabilities?: readonly PluginCapability[];
  // Corresponding code resource for storage/runner lookup.
  methodInfo?: MethodInfo;
  resourceSource?: ResourceSource;
};

// runner.proto::CreateLiveModuleRequest compatibility
export type PluginLiveRuntimeConfig =
  | {
      isStateful: true;
      defaultState: unknown;
      ttlMs?: number;
    }
  | {
      isStateful: false;
      ttlMs?: number;
    };

export enum LifecycleHookType {
  Init = 'onInit',
  Restore = 'onRestore',
  GameStart = 'onGameStart',
  RoundStart = 'onRoundStart',
  RoundEnd = 'onRoundEnd',
  GameEnd = 'onGameEnd',
  Unload = 'onUnload',
  Dispose = 'onDispose',
}

export enum DecisionHookType {
  EvaluateAvailableActions = 'onEvaluateAvailableActions',
  ValidateAction = 'onValidateAction',
  ResolveAction = 'onResolveAction',
  CalculateScore = 'onCalculateScore',
}

// Backward compatible alias for older naming.
export { DecisionHookType as ActionHookType };

export type HookType = LifecycleHookType | DecisionHookType;

export enum PluginHookCategory {
  Lifecycle = 'lifecycle',
  Decision = 'decision',
}

export enum PluginHookMode {
  Query = 'query',
  Command = 'command',
}

export type PluginHookDefinition = {
  type: HookType;
  category: PluginHookCategory;
  mode: PluginHookMode;
};

export enum PluginActionType {
  STANDARD = 'STANDARD',
  CUSTOM_PLUGIN = 'CUSTOM_PLUGIN',
}

export type PluginActionDefinition = {
  id: string;
  label: string;
  type: PluginActionType;
  payload?: Record<string, unknown>;
};

export type PluginHookPayloads = {
  [LifecycleHookType.Init]: {
    storage?: unknown;
  };
  [LifecycleHookType.Restore]: {
    storage: unknown;
    snapshot: GameSnapshot;
  };
  [LifecycleHookType.GameStart]: {};
  [LifecycleHookType.RoundStart]: {
    roundIndex: number;
  };
  [LifecycleHookType.RoundEnd]: {
    roundIndex: number;
  };
  [LifecycleHookType.GameEnd]: {
    finalPlayerScores: Record<string, number>;
  };
  [LifecycleHookType.Unload]: {
    reason?: string;
  };
  [LifecycleHookType.Dispose]: {
    reason?: string;
  };
  [DecisionHookType.EvaluateAvailableActions]: {
    playerId: string;
    tiles: MahjongTile[];
    discardedTiles?: Set<MahjongTile>;
  };
  [DecisionHookType.ValidateAction]: {
    playerId: string;
    action: PlayerAction;
    tiles: MahjongTile[];
    discardedTiles?: Set<MahjongTile>;
  };
  [DecisionHookType.ResolveAction]: {
    playerId: string;
    action: PlayerAction;
    tiles: MahjongTile[];
    discardedTiles?: Set<MahjongTile>;
  };
  [DecisionHookType.CalculateScore]: {
    winnerPlayerId: string;
    winningTiles: MahjongTile[];
    finalPlayerScores: Record<string, number>;
    discardedTiles?: Set<MahjongTile>;
  };
};

export type PluginHookContext<StorageType, PayloadType> = {
  requestId: string;
  manifest: PluginManifest;
  hook: HookType;
  category: PluginHookCategory;
  mode: PluginHookMode;
  storage: StorageType;
  payload: PayloadType;
  playerId?: string;
  roundIndex?: number;
};

export enum GameStatusPatches {
  PlayerHandTiles,
  PlayerDrawedTiles,
  PlayerActionTiles,
  RedDoraTile,
  UraDoraTile,
  PlayerScores,
  GameStats,
}

export type GameStatsPatch = {
  patchesType: GameStatusPatches.GameStats;
  stats: Record<string, unknown>;
  isGameStatsPatch: true;
};

export type PluginHookResult<
  StorageType,
  ActionType = PluginActionDefinition,
> = {
  accepted?: boolean;
  reason?: string;
  storage?: StorageType;
  patch?: Partial<StorageType>;
  gameStatsPatch?: GameStatsPatch[];
  availableActions?: readonly ActionType[];
  stopPropagation?: boolean;
};

export type WithPluginId<T> = T & {
  pluginId: string;
};

export type PluginHookHandler<StorageType, HookName extends HookType> = (
  context: PluginHookContext<StorageType, PluginHookPayloads[HookName]>,
) =>
  | void
  | PluginHookResult<StorageType>
  | Promise<void | PluginHookResult<StorageType>>;

export type PluginLifecycleHooks<StorageType> = Partial<{
  [HookName in LifecycleHookType]: PluginHookHandler<StorageType, HookName>;
}>;

export type PluginDecisionHooks<StorageType> = Partial<{
  [HookName in DecisionHookType]: PluginHookHandler<StorageType, HookName>;
}>;

export type PluginInstance<StorageType> = {
  manifest: PluginManifest;
  defaultStore: StorageType;
  runtime: PluginLiveRuntimeConfig;
  implementation: {
    lifecycle?: PluginLifecycleHooks<StorageType>;
    decision?: PluginDecisionHooks<StorageType>;
  };
  hooks: readonly PluginHookDefinition[];
};

export type PluginImplementation<StorageType> =
  PluginInstance<StorageType>['implementation'];

// runtime live_module_runner.ts and runner.proto contracts
export type LiveModuleFunctionArgs = {
  this: unknown;
  args: unknown[];
};

export type RunnerCreateLiveModulePayload = {
  manifest: MethodInfo;
  isStateful?: boolean;
};

export type RunnerCallLiveModulePayload = {
  moduleId: string;
  functionName: string;
  payload: LiveModuleFunctionArgs;
};

export type RunnerLiveModuleBinding = {
  pluginId: string;
  moduleId: string;
  manifest: MethodInfo;
  runtime: PluginLiveRuntimeConfig;
  dependencies: MethodInfo[];
};
