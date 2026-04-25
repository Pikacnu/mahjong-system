import {
  DecisionHookType,
  LifecycleHookType,
  type HookType,
  type PluginHookDefinition,
  type PluginHookPayloads,
  type PluginHookResult,
  type PluginImplementation,
  type PluginInstance,
  type PluginLiveRuntimeConfig,
  type MethodInfo,
  ResourceSource,
  decodeFromBytes,
  decodeUnknown,
  type RunnerLiveModuleBinding,
  type WithPluginId,
  GameStatusPatches,
  type PluginActionDefinition,
  type StoragePatch,
  StoragePatchType,
} from 'utils';
import type { RunnerGateway, StorageGateway } from '../type/gateway';

type RegisteredPlugin = {
  priority: number;
  instance: PluginInstance<unknown>;
};

export class PluginManager {
  private plugins = new Map<string, RegisteredPlugin>();
  private pluginStorages = new Map<string, unknown>();
  private runnerPluginBinding = new Map<string, RunnerLiveModuleBinding>();
  private hookHandlers = new Map<
    HookType,
    {
      priority: number;
      pluginId: string;
    }[]
  >();
  private globalStorageValues = new Map<string, unknown>();
  private globalStorageValuesStoresPriority: Map<string, number> = new Map();

  constructor(
    private readonly runner: RunnerGateway,
    private readonly storage?: StorageGateway,
  ) {}

  public async addPlugin<StorageType>(
    plugin: PluginInstance<StorageType>,
    priority = 0,
  ) {
    const pluginId = plugin.manifest.id;
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin with id ${pluginId} already exists`);
    }

    this.plugins.set(pluginId, {
      priority,
      instance: plugin as PluginInstance<unknown>,
    });

    // Initialize plugin storage: prefer persisted/default from function-storage when available
    let initialStore: unknown = plugin.defaultStore ?? {};
    if (this.storage && plugin.manifest?.methodInfo) {
      try {
        const definition = await this.storage.getPluginDefinition({
          methodInfo: plugin.manifest.methodInfo,
          resourceSource: plugin.manifest.resourceSource || ResourceSource.USER,
        });
        initialStore = this.normalizeDefaultStore(definition.defaultStore);
      } catch (err) {
        // If storage call fails, fallback to plugin-provided defaultStore
        // Keep behavior non-fatal to avoid breaking plugin registration
        // eslint-disable-next-line no-console
        console.warn(
          `Failed to load plugin defaultStore for ${pluginId}, using provided defaultStore.`,
          err,
        );
        initialStore = plugin.defaultStore ?? {};
      }
    }

    this.pluginStorages.set(pluginId, initialStore);

    if (plugin.globalStorageDefaultValues && plugin.usedGlobalStorageKeys) {
      for (const [key, value] of Object.entries(
        plugin.globalStorageDefaultValues,
      )) {
        if (!plugin.usedGlobalStorageKeys.includes(key)) {
          continue;
        }
        this.replaceGlobalStorageByPriority(key, value, priority);
      }
    }

    for (const hook of plugin.hooks) {
      this.registerHook(pluginId, hook, priority);
    }
  }

  public replaceGlobalStorageByPriority(
    key: string,
    value: unknown,
    priority: number,
  ) {
    const currentPriority = this.globalStorageValuesStoresPriority.get(key);
    if (currentPriority === undefined || priority > currentPriority) {
      this.globalStorageValues.set(key, value);
      this.globalStorageValuesStoresPriority.set(key, priority);
    }
  }

  public setGlobalStorageValue(key: string, value: unknown) {
    this.globalStorageValues.set(key, value);
  }

  public getGlobalStorageValue(key: string): unknown {
    return this.globalStorageValues.get(key);
  }

  public async removePlugin(pluginId: string) {
    const binding = this.runnerPluginBinding.get(pluginId);
    if (binding) {
      await this.runner.removeLiveModule({ moduleId: binding.moduleId });
      this.runnerPluginBinding.delete(pluginId);
    }

    this.plugins.delete(pluginId);
    this.pluginStorages.delete(pluginId);

    for (const [hook, handlers] of this.hookHandlers.entries()) {
      this.hookHandlers.set(
        hook,
        handlers.filter((handler) => handler.pluginId !== pluginId),
      );
    }
  }

  public bindRunnerModule(binding: RunnerLiveModuleBinding) {
    this.runnerPluginBinding.set(binding.pluginId, binding);
  }

  public unbindRunnerModule(pluginId: string) {
    this.runnerPluginBinding.delete(pluginId);
  }

  public getRunnerBinding(
    pluginId: string,
  ): RunnerLiveModuleBinding | undefined {
    return this.runnerPluginBinding.get(pluginId);
  }

  public registerHook(
    pluginId: string,
    hook: PluginHookDefinition,
    priority = 0,
  ) {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin with id ${pluginId} not found`);
    }
    const current = this.hookHandlers.get(hook.type) || [];
    this.hookHandlers.set(hook.type, [...current, { pluginId, priority }]);
  }

  public getHookPipeline(hookType: HookType): string[] {
    return (this.hookHandlers.get(hookType) || [])
      .sort((a, b) => a.priority - b.priority)
      .map((handler) => handler.pluginId);
  }

  private getHookPipelineWithPriority(
    hookType: HookType,
  ): { pluginId: string; priority: number }[] {
    return (this.hookHandlers.get(hookType) || []).sort(
      (a, b) => a.priority - b.priority,
    );
  }

  public async runHook<StorageType, HookName extends HookType>({
    hook,
    requestId,
    payload,
    playerId,
    roundIndex,
  }: {
    hook: HookName;
    requestId: string;
    payload: PluginHookPayloads[HookName];
    playerId?: string;
    roundIndex?: number;
  }): Promise<WithPluginId<PluginHookResult<StorageType>>[]> {
    const results: WithPluginId<PluginHookResult<StorageType>>[] = [];

    for (const pluginId of this.getHookPipeline(hook)) {
      const registered = this.plugins.get(pluginId);
      if (!registered) continue;

      const plugin = registered.instance as PluginInstance<StorageType>;
      const hookDef = plugin.hooks.find((h) => h.type === hook);
      if (!hookDef) continue;

      const storage = this.pluginStorages.get(pluginId) as StorageType;

      // if (plugin.runtime.isStateful) {
      //   // get Global Storage Values for the plugin
      //   const injectionValues = plugin.usedGlobalStorageKeys.map((key) => ({
      //     key,
      //     value: this.getGlobalStorageValue(key),
      //   }));
      //   // Get __state__ value from the plugin
      //   const values = (await this.runner.getLiveModuleValue({
      //     moduleId: pluginId,
      //     key: '__state__',
      //   })) as StorageType | undefined;
      //   const mergedStorage = { ...storage, ...values };
      //   if (values) {
      //     this.pluginStorages.set(pluginId, {
      //       ...storage,
      //       ...mergedStorage,
      //     });
      //   }
      //   // Inject global storage values into plugin storage with a special key
      //   await this.runner.setLiveModuleValue({
      //     moduleId: pluginId,
      //     key: '__state__',
      //     value: injectionValues,
      //   });
      // } else {
      //   // For non-stateful plugins, we can directly inject global storage values into the plugin storage before executing the hook, and clear them afterward to avoid unintended side effects between hooks
      //   const injectionValues = plugin.usedGlobalStorageKeys.reduce(
      //     (acc, key) => {
      //       acc[key] = this.getGlobalStorageValue(key);
      //       return acc;
      //     },
      //     {} as Record<string, unknown>,
      //   );
      //   const mergedStorage = { ...storage, ...injectionValues };
      //   this.pluginStorages.set(pluginId, mergedStorage);
      // }

      const injectionValues = plugin.usedGlobalStorageKeys.reduce(
        (acc, key) => {
          acc[key] = this.getGlobalStorageValue(key);
          return acc;
        },
        {} as Record<string, unknown>,
      );
      const mergedStorage = { ...storage, ...injectionValues };
      this.pluginStorages.set(pluginId, mergedStorage);

      const implementationResult = await this.executeLocalHook(plugin, hook, {
        requestId,
        payload,
        playerId,
        roundIndex,
        storage,
        hookDef,
      });

      if (implementationResult) {
        results.push({
          ...implementationResult,
          pluginId,
        } as WithPluginId<PluginHookResult<StorageType>>);
        if (implementationResult.stopPropagation) {
          break;
        }
        if (
          implementationResult.storagePatch &&
          Array.isArray(implementationResult.storagePatch) &&
          implementationResult.storagePatch.length > 0
        ) {
          this.applyStoragePatch(implementationResult.storagePatch, plugin);
        }
        continue;
      }

      const runnerResult = await this.executeRunnerHook(
        pluginId,
        plugin.runtime,
        hook,
        {
          requestId,
          payload,
        },
      );

      if (runnerResult === undefined) {
        continue;
      }

      results.push({
        ...runnerResult,
        pluginId,
      } as WithPluginId<PluginHookResult<StorageType>>);

      if (runnerResult.stopPropagation) {
        break;
      }
    }

    return results;
  }

  private async executeLocalHook<StorageType>(
    plugin: PluginInstance<StorageType>,
    hook: HookType,
    context: {
      requestId: string;
      payload: unknown;
      playerId?: string;
      roundIndex?: number;
      storage: StorageType;
      hookDef: PluginHookDefinition;
    },
  ): Promise<PluginHookResult<StorageType> | undefined> {
    const implementation = this.getHookImplementation(
      plugin.implementation,
      hook,
    );
    if (!implementation) {
      return undefined;
    }

    const result = await implementation({
      requestId: context.requestId,
      manifest: plugin.manifest,
      hook,
      category: context.hookDef.category,
      mode: context.hookDef.mode,
      storage: context.storage,
      payload: context.payload,
      playerId: context.playerId,
      roundIndex: context.roundIndex,
    } as any);

    return result || undefined;
  }

  private getHookImplementation<StorageType>(
    implementation: PluginImplementation<StorageType>,
    hook: HookType,
  ) {
    if (Object.values(LifecycleHookType).includes(hook as LifecycleHookType)) {
      return implementation.lifecycle?.[hook as LifecycleHookType];
    }
    if (Object.values(DecisionHookType).includes(hook as DecisionHookType)) {
      return implementation.decision?.[hook as DecisionHookType];
    }
    return undefined;
  }

  private async executeRunnerHook<StorageType>(
    pluginId: string,
    runtime: PluginLiveRuntimeConfig,
    hook: HookType,
    context: {
      requestId: string;
      payload: unknown;
    },
  ): Promise<PluginHookResult<StorageType> | undefined> {
    let binding = this.runnerPluginBinding.get(pluginId);
    if (!binding) {
      binding = await this.createRunnerBinding(pluginId, runtime);
    }

    const response = await this.runner.callLiveModuleFn({
      moduleId: binding.moduleId,
      functionName: hook,
      payload: {
        this: {
          requestId: context.requestId,
        },
        args: [context.payload],
      },
    });

    if (response && typeof response === 'object') {
      return response as PluginHookResult<StorageType>;
    }
    return undefined;
  }

  private async createRunnerBinding(
    pluginId: string,
    runtime: PluginLiveRuntimeConfig,
  ): Promise<RunnerLiveModuleBinding> {
    const registered = this.plugins.get(pluginId);
    if (!registered) {
      throw new Error(`Plugin with id ${pluginId} not found`);
    }

    const manifest = registered.instance.manifest.methodInfo;
    if (!manifest) {
      throw new Error(`Plugin ${pluginId} is missing manifest.methodInfo`);
    }

    let resolvedRuntime: PluginLiveRuntimeConfig = runtime;
    let dependencies: MethodInfo[] = [];

    if (this.storage) {
      const definition = await this.storage.getPluginDefinition({
        methodInfo: manifest,
        resourceSource:
          registered.instance.manifest.resourceSource || ResourceSource.USER,
      });
      dependencies = definition.dependencies;

      resolvedRuntime = {
        defaultState: this.normalizeDefaultStore(definition.defaultStore),
        ttlMs: runtime.ttlMs,
      };

      resolvedRuntime = {
        ttlMs: runtime.ttlMs,
      };
    }

    const created = await this.runner.createLiveModule({
      manifest,
    });

    const binding: RunnerLiveModuleBinding = {
      pluginId,
      moduleId: created.moduleId,
      manifest,
      runtime: resolvedRuntime,
      dependencies,
    };

    this.runnerPluginBinding.set(pluginId, binding);

    return binding;
  }

  private validValue(value: unknown, source: unknown): boolean {
    if (typeof source === 'object' && source !== null) {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      for (const key in source as Record<string, unknown>) {
        if (!(key in (value as Record<string, unknown>))) {
          return false;
        }
        if (
          !this.validValue(
            (value as Record<string, unknown>)[key],
            (source as Record<string, unknown>)[key],
          )
        ) {
          return false;
        }
      }
      return true;
    }
    return typeof value === typeof source;
  }

  private applyStoragePatch<T extends unknown>(
    patches: StoragePatch<T>[],
    plugin: PluginInstance<T>,
  ) {
    for (const patch of patches) {
      let currentValue: unknown;
      const keyString = patch.key.toString();
      switch (patch.type) {
        case StoragePatchType.Global: {
          if (!plugin.usedGlobalStorageKeys.includes(keyString)) {
            console.error('Key Not Registeried By Plugin');
            break;
          }
          currentValue = this.getGlobalStorageValue(keyString);
          if (this.validValue(patch.value, currentValue)) {
            this.setGlobalStorageValue(keyString, patch.value);
          } else {
            console.error('Invalid Value Type For Global Storage');
          }
          break;
        }
        case StoragePatchType.Plugin: {
          currentValue = this.pluginStorages.get(patch.key as string);
          if (this.validValue(patch.value, currentValue)) {
            this.pluginStorages.set(patch.key as string, patch.value);
          } else {
            console.error('Invalid Value Type For Plugin Storage');
          }
          break;
        }
      }
    }
  }

  private normalizeDefaultStore(defaultStore: unknown): unknown {
    return decodeUnknown(decodeFromBytes(defaultStore)) ?? {};
  }
}
