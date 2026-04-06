export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
};

export type Plugin<StorageType> = {
  manifest: PluginManifest;
  defaultStorage: StorageType;
  hooks: {
    [key in HookType]?: (
      context: PluginHookContext<StorageType, PluginHookPayloads[key]>,
    ) => void;
  };
};

export type PluginHookContext<
  StorageType,
  PayloadType = PluginHookPayloads[HookType],
> = {
  requestId: string;
  storage: StorageType;
  payload: PayloadType;
};

export type PluginHookPayloads = {
  [LifecycleHookType.Init]: {};
  [LifecycleHookType.Restore]: {};
  [LifecycleHookType.GameStart]: {};
  [LifecycleHookType.RoundStart]: {};
  [LifecycleHookType.RoundEnd]: {};
  [LifecycleHookType.GameEnd]: {};
  [LifecycleHookType.Unload]: {};
  [LifecycleHookType.Dispose]: {};
  //
  [ActionHookType.EvaluateAvailableActions]: {};
  [ActionHookType.ValidateAction]: {};
  [ActionHookType.ResolveAction]: {};
  [ActionHookType.CalculateScore]: {};
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

export enum ActionHookType {
  EvaluateAvailableActions = 'onEvaluateAvailableActions',
  ValidateAction = 'onValidateAction',
  ResolveAction = 'onResolveAction',
  CalculateScore = 'onCalculateScore',
}

export type HookType = LifecycleHookType | ActionHookType;

export class PluginManager {
  // key as plugin id
  private plugins: Map<string, PluginManifest> = new Map();

  private pluginStorages = new Map<string, unknown>();

  private hookHandlers: Map<HookType, Function[]> = new Map();

  constructor() {}

  public addPlugin(plugin: PluginManifest) {}

  public onHook(hookType: HookType) {
    const activateHooks = this.hookHandlers.get(hookType) || [];
    for (const hook of activateHooks) {
      hook();
    }
  }
}
