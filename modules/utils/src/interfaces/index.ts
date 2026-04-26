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
      defaultState: unknown;
      ttlMs?: number;
    }
  | {
      ttlMs?: number;
    };

export enum LifecycleHookType {
  Init = 'onInit',
  Restore = 'onRestore',
  GameStart = 'onGameStart',
  RoundStart = 'onRoundStart',
  PlayerGetsTile = 'onPlayerGetsTile',
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
  [LifecycleHookType.PlayerGetsTile]: {
    playerId: string;
    tile: MahjongTile;
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
  RedDoraTile,
  UraDoraTile,
  GameStats,
  RoundEnd,
  GameEnd,
}

export enum PlayerStatusPatches {
  PlayerHandTile,
  PlayerHandTiles,
  PlayerDrawedTiles, // unknown usage
  PlayerActionTiles, // unknown usage
  PlayerScores,
}

export type PatchesType = GameStatusPatches | PlayerStatusPatches;

export type GameStatsPatch<
  T extends keyof PatchesArgument = keyof PatchesArgument,
> = T extends any
  ? {
      patchType: T;
      data: PatchesArgument[T];
    }
  : never;

export enum PatchActionType {
  Update,
  Add,
  Remove,
}

export interface PlayerStatusPatchesArgument {
  [PlayerStatusPatches.PlayerHandTile]: {
    playerId: string;
    handTile: MahjongTile;
    replaceTile?: MahjongTile;
  };
  [PlayerStatusPatches.PlayerHandTiles]: {
    playerId: string;
    handTiles: MahjongTile[];
  };
  [PlayerStatusPatches.PlayerDrawedTiles]: {
    playerId: string;
    drawedTiles: MahjongTile[];
  };
  [PlayerStatusPatches.PlayerActionTiles]: {
    playerId: string;
    actionTiles: MahjongTile[];
  };
  [PlayerStatusPatches.PlayerScores]: {
    playerId: string;
    delta: number;
  };
}

export interface GameStatusPatchesArgument {
  [GameStatusPatches.RedDoraTile]: {
    redDoraTile: MahjongTile;
    action: Exclude<PatchActionType, PatchActionType.Remove>;
  };
  [GameStatusPatches.UraDoraTile]: {
    uraDoraTile: MahjongTile & { isOpen: boolean };
    action: Exclude<PatchActionType, PatchActionType.Remove>;
  };
  [GameStatusPatches.GameStats]: {
    stats: Record<string, unknown>;
  };
  [GameStatusPatches.GameEnd]: {
    finalPlayerScores: Record<string, number>;
  };
}

export type PatchesArgument = GameStatusPatchesArgument &
  PlayerStatusPatchesArgument;

export enum StoragePatchType {
  Global,
  Plugin,
}

export type StoragePatch<T> = {
  type: StoragePatchType;
  key: keyof T;
  value: T[keyof T];
};

export type PluginHookResult<
  StorageType,
  ActionType = PluginActionDefinition,
> =
  | {
      pluginStorage?: StorageType;
      storagePatch?: StoragePatch<StorageType>[];
      gameStatsPatch?: GameStatsPatch[];
      pluginAction?: readonly ActionType[];
      stopPropagation?: boolean;
      reject?: boolean;
      // reject work as stopPropagation but also indicates the action is rejected,
      // which can be used by caller to show feedback to user.
      // For exp : Furtien can reject a Ron declaration if it determines the player is not in Tenpai,
      // and the game server can show "Ron declaration rejected" feedback to user based on the reject flag.
    }
  | undefined;

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
    lifecycle?: PluginLifecycleHooks<StorageType> & {
      ReadGlobalStorageValues?: string[];
      SetGlobalStorageValues?: string[];
    };
    decision?: PluginDecisionHooks<StorageType> & {
      ReadGlobalStorageValues?: string[];
      SetGlobalStorageValues?: string[];
    };
  };
  usedGlobalStorageKeys: readonly string[];
  globalStorageDefaultValues: Record<string, unknown>;
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
