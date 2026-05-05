import { z } from 'zod';
import type { ActionSharedData } from '.';
import type { GameSnapshot, MahjongTile, PlayerAction } from '../mahjong/type';

export const MethodInfoSchema = z.object({
  name: z.string(),
  version: z.number(),
});
export type MethodInfo = z.infer<typeof MethodInfoSchema>;

export enum ResourceSource {
  BUILTIN = 'BUILTIN',
  USER = 'USER',
}

export const ResourceSourceToNumber: Record<ResourceSource, number> = {
  [ResourceSource.BUILTIN]: 0,
  [ResourceSource.USER]: 1,
};

export const NumberToResourceSource: Record<number, ResourceSource> = {
  0: ResourceSource.BUILTIN,
  1: ResourceSource.USER,
};

export enum PluginCapability {
  Lifecycle = 'lifecycle',
  Decision = 'decision',
  Query = 'query',
  Command = 'command',
}

export const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  capabilities: z.array(z.nativeEnum(PluginCapability)).readonly().optional(),
  methodInfo: MethodInfoSchema.optional(),
  resourceSource: z.nativeEnum(ResourceSource).optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export const PluginLiveRuntimeConfigSchema = z.union([
  z.object({
    defaultState: z.unknown(),
    ttlMs: z.number().optional(),
  }),
  z.object({
    ttlMs: z.number().optional(),
  }),
]);
export type PluginLiveRuntimeConfig = z.infer<
  typeof PluginLiveRuntimeConfigSchema
>;

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
  EvaluateHand = 'onEvaluateHand',
  CalculateScore = 'onCalculateScore',
  ScoreDistribution = 'onScoreDistribution',
}

export { DecisionHookType as ActionHookType };

export const HookTypeSchema = z.union([
  z.nativeEnum(LifecycleHookType),
  z.nativeEnum(DecisionHookType),
]);
export type HookType = z.infer<typeof HookTypeSchema>;

export enum PluginHookCategory {
  Lifecycle = 'lifecycle',
  Decision = 'decision',
}

export enum PluginHookMode {
  Query = 'query',
  Command = 'command',
}

export const PluginHookDefinitionSchema = z.object({
  type: HookTypeSchema,
  category: z.nativeEnum(PluginHookCategory),
  mode: z.nativeEnum(PluginHookMode),
});
export type PluginHookDefinition = z.infer<typeof PluginHookDefinitionSchema>;

export enum PluginActionType {
  STANDARD = 'STANDARD',
  CUSTOM_PLUGIN = 'CUSTOM_PLUGIN',
  EVALUATION = 'EVALUATION',
}

export const PluginActionDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.nativeEnum(PluginActionType),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type PluginActionDefinition = z.infer<
  typeof PluginActionDefinitionSchema
>;

export const PluginHookPayloadsSchema = z.object({
  [LifecycleHookType.Init]: z.object({
    storage: z.unknown().optional(),
  }),
  [LifecycleHookType.Restore]: z.object({
    storage: z.unknown(),
    snapshot: z.custom<GameSnapshot>(),
  }),
  [LifecycleHookType.GameStart]: z.object({}),
  [LifecycleHookType.RoundStart]: z.object({
    roundIndex: z.number(),
  }),
  [LifecycleHookType.PlayerGetsTile]: z.object({
    playerId: z.string(),
    tile: z.custom<MahjongTile>(),
  }),
  [LifecycleHookType.RoundEnd]: z.object({
    roundIndex: z.number(),
  }),
  [LifecycleHookType.GameEnd]: z.object({
    finalPlayerScores: z.record(z.string(), z.number()),
  }),
  [LifecycleHookType.Unload]: z.object({
    reason: z.string().optional(),
  }),
  [LifecycleHookType.Dispose]: z.object({
    reason: z.string().optional(),
  }),
  [DecisionHookType.EvaluateAvailableActions]: z.object({
    playerId: z.string(),
    tiles: z.array(z.custom<MahjongTile>()),
    discardedTiles: z.custom<Set<MahjongTile>>().optional(),
  }),
  [DecisionHookType.ValidateAction]: z.object({
    playerId: z.string(),
    action: z.custom<PlayerAction>(),
    tiles: z.array(z.custom<MahjongTile>()),
    discardedTiles: z.custom<Set<MahjongTile>>().optional(),
  }),
  [DecisionHookType.ResolveAction]: z.object({
    playerId: z.string(),
    action: z.custom<PlayerAction>(),
    tiles: z.array(z.custom<MahjongTile>()),
    discardedTiles: z.custom<Set<MahjongTile>>().optional(),
  }),
  [DecisionHookType.EvaluateHand]:
    z.custom<Omit<ActionSharedData, 'isCurrentPlayer'>>(),
  [DecisionHookType.CalculateScore]: z.custom<
    Omit<ActionSharedData, 'isCurrentPlayer'> & any
  >(),
  [DecisionHookType.ScoreDistribution]: z.custom<
    Omit<ActionSharedData, 'isCurrentPlayer'> & { originalScore: number }
  >(),
});

export type PluginHookPayloads = z.infer<typeof PluginHookPayloadsSchema>;

export const PluginHookContextSchema = <
  StorageType extends z.ZodType,
  PayloadType extends z.ZodType,
>(
  storageSchema: StorageType,
  payloadSchema: PayloadType,
) =>
  z.object({
    requestId: z.string(),
    manifest: PluginManifestSchema,
    hook: HookTypeSchema,
    category: z.nativeEnum(PluginHookCategory),
    mode: z.nativeEnum(PluginHookMode),
    storage: storageSchema,
    payload: payloadSchema,
    playerId: z.string().optional(),
    roundIndex: z.number().optional(),
  });

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
  PlayerDrawedTiles,
  PlayerActionTiles,
  PlayerScores,
}

export type PatchesType = GameStatusPatches | PlayerStatusPatches;

export const PlayerStatusPatchesArgumentSchema = z.object({
  [PlayerStatusPatches.PlayerHandTile]: z.object({
    playerId: z.string(),
    handTile: z.custom<MahjongTile>(),
    replaceTile: z.custom<MahjongTile>().optional(),
  }),
  [PlayerStatusPatches.PlayerHandTiles]: z.object({
    playerId: z.string(),
    handTiles: z.array(z.custom<MahjongTile>()),
  }),
  [PlayerStatusPatches.PlayerDrawedTiles]: z.object({
    playerId: z.string(),
    drawedTiles: z.array(z.custom<MahjongTile>()),
  }),
  [PlayerStatusPatches.PlayerActionTiles]: z.object({
    playerId: z.string(),
    actionTiles: z.array(z.custom<MahjongTile>()),
  }),
  [PlayerStatusPatches.PlayerScores]: z.object({
    playerId: z.string(),
    delta: z.number(),
  }),
});

export type PlayerStatusPatchesArgument = z.infer<
  typeof PlayerStatusPatchesArgumentSchema
>;

export enum PatchActionType {
  Update,
  Add,
  Remove,
}

export const GameStatusPatchesArgumentSchema = z.object({
  [GameStatusPatches.RedDoraTile]: z.object({
    redDoraTile: z.custom<MahjongTile>(),
    action: z.custom<Exclude<PatchActionType, PatchActionType.Remove>>(),
  }),
  [GameStatusPatches.UraDoraTile]: z.object({
    uraDoraTile: z.custom<MahjongTile & { isOpen: boolean }>(),
    action: z.custom<Exclude<PatchActionType, PatchActionType.Remove>>(),
  }),
  [GameStatusPatches.GameStats]: z.object({
    stats: z.record(z.string(), z.unknown()),
  }),
  [GameStatusPatches.GameEnd]: z.object({}),
});

export type GameStatusPatchesArgument = z.infer<
  typeof GameStatusPatchesArgumentSchema
>;

export const PatchesArgumentSchema = GameStatusPatchesArgumentSchema.merge(
  PlayerStatusPatchesArgumentSchema,
);

export type PatchesArgument = GameStatusPatchesArgument &
  PlayerStatusPatchesArgument;

export type GameStatsPatch<
  T extends keyof PatchesArgument = keyof PatchesArgument,
> = T extends any
  ? {
      patchType: T;
      data: PatchesArgument[T];
    }
  : never;

export enum StoragePatchType {
  Global,
  Plugin,
}

export const StoragePatchSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    type: z.enum(StoragePatchType),
    key: z.string(),
    value: valueSchema,
  });

export type StoragePatch<T> = {
  type: StoragePatchType;
  key: keyof T;
  value: T[keyof T];
};

export const PluginHookResultSchema = <
  StorageType extends z.ZodType,
  ActionType extends z.ZodType,
>(
  storageSchema: StorageType,
  actionSchema: ActionType,
) =>
  z
    .object({
      pluginStorage: storageSchema.optional(),
      storagePatch: z.array(StoragePatchSchema(storageSchema)).optional(),
      gameStatsPatch: z.array(z.custom<GameStatsPatch>()).optional(),
      pluginAction: z.array(actionSchema).readonly().optional(),
      stopPropagation: z.boolean().optional(),
      reject: z.boolean().optional(),
    })
    .optional();

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
    }
  | undefined;

export const WithPluginIdSchema = <T extends z.ZodType>(schema: T) =>
  schema.and(z.object({ pluginId: z.string() }));

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

export const LiveModuleFunctionArgsSchema = z.object({
  this: z.unknown(),
  args: z.array(z.unknown()),
});
export type LiveModuleFunctionArgs = z.infer<
  typeof LiveModuleFunctionArgsSchema
>;

export const RunnerCreateLiveModulePayloadSchema = z.object({
  manifest: MethodInfoSchema,
});
export type RunnerCreateLiveModulePayload = z.infer<
  typeof RunnerCreateLiveModulePayloadSchema
>;

export const RunnerCallLiveModulePayloadSchema = z.object({
  moduleId: z.string(),
  functionName: z.string(),
  payload: LiveModuleFunctionArgsSchema,
});
export type RunnerCallLiveModulePayload = z.infer<
  typeof RunnerCallLiveModulePayloadSchema
>;

export const RunnerLiveModuleBindingSchema = z.object({
  pluginId: z.string(),
  moduleId: z.string(),
  manifest: MethodInfoSchema,
  runtime: PluginLiveRuntimeConfigSchema,
  dependencies: z.array(MethodInfoSchema),
});
export type RunnerLiveModuleBinding = z.infer<
  typeof RunnerLiveModuleBindingSchema
>;
