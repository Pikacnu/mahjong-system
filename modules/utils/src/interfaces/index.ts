import type { GameSnapshot, MahjongTile, PlayerAction } from '../mahjong/type';

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  //priority?: number;
  capabilities?: readonly PluginCapability[];
};

export type PluginInterface = PluginManifest;

export enum PluginCapability {
  Lifecycle = 'lifecycle',
  Decision = 'decision',
  Query = 'query',
  Command = 'command',
  Stateful = 'stateful',
}

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
  //priority?: number;
};

export enum PluginActionType {
  STANDARD = 'STANDARD',
  CUSTOM_PLUGIN = 'CUSTOM_PLUGIN',
}

export type PluginActionDefinition = {
  id: string;
  label: string;
  type: PluginActionType;
  //priority?: number;
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
    winningPlayerId: string | null;
    winningTiles: MahjongTile[] | null;
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
  };
  [DecisionHookType.ValidateAction]: {
    playerId: string;
    action: PlayerAction;
    tiles: MahjongTile[];
  };
  [DecisionHookType.ResolveAction]: {
    playerId: string;
    action: PlayerAction;
    tiles: MahjongTile[];
  };
  [DecisionHookType.CalculateScore]: {
    winnerPlayerId: string;
    winningTiles: MahjongTile[];
    finalPlayerScores: Record<string, number>;
  };
};

export type PluginHookContext<StorageType, PayloadType> = {
  manifest: PluginManifest;
  hook: HookType;
  category: PluginHookCategory;
  mode: PluginHookMode;
  storage: StorageType;
  payload: PayloadType;
  playerId?: string;
  roundIndex?: number;
};

export type PluginHookResult<
  StorageType,
  ActionType = PluginActionDefinition,
> = {
  accepted?: boolean;
  reason?: string;
  storage?: StorageType;
  patch?: Partial<StorageType>;
  availableActions?: readonly ActionType[];
  stopPropagation?: boolean;
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
  implementation: {
    lifecycle?: PluginLifecycleHooks<StorageType>;
    decision?: PluginDecisionHooks<StorageType>;
  };
  hooks: readonly PluginHookDefinition[];
};

export type PluginImplementation<StorageType> =
  PluginInstance<StorageType>['implementation'];
