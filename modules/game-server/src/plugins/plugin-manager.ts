import {
  DecisionHookType,
  LifecycleHookType,
  PluginHookCategory,
  PluginHookMode,
  type HookType,
  type PluginHookDefinition,
  type PluginHookPayloads,
  type PluginHookResult,
  type PluginImplementation,
  type PluginInstance,
  type PluginLiveRuntimeConfig,
  type MethodInfo,
  ResourceSource,
  type RunnerCreateLiveModulePayload,
  type RunnerLiveModuleBinding,
} from 'utils';

type RegisteredPlugin = {
  priority: number;
  instance: PluginInstance<unknown>;
};

export type RunnerGateway = {
  createLiveModule(
    payload: RunnerCreateLiveModulePayload,
  ): Promise<{ moduleId: string }>;
  callLiveModuleFn(payload: {
    moduleId: string;
    functionName: string;
    payload: { this: unknown; args: unknown[] };
  }): Promise<unknown>;
  removeLiveModule(payload: { moduleId: string }): Promise<void>;
  setLiveModuleValue(payload: {
    moduleId: string;
    key: string;
    value: unknown;
  }): Promise<void>;
};

export type StorageGateway = {
  getPluginDefinition(payload: {
    methodInfo: MethodInfo;
    resourceSource?: ResourceSource;
  }): Promise<{
    isStateful: boolean;
    defaultStore: unknown;
    dependencies: MethodInfo[];
  }>;
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

  constructor(
    private readonly runner: RunnerGateway,
    private readonly storage?: StorageGateway,
  ) {}

  public addPlugin<StorageType>(
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
    this.pluginStorages.set(pluginId, plugin.defaultStore);

    for (const hook of plugin.hooks) {
      this.registerHook(pluginId, hook, priority);
    }
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
  }): Promise<PluginHookResult<StorageType>[]> {
    const results: PluginHookResult<StorageType>[] = [];

    for (const pluginId of this.getHookPipeline(hook)) {
      const registered = this.plugins.get(pluginId);
      if (!registered) continue;

      const plugin = registered.instance as PluginInstance<StorageType>;
      const hookDef = plugin.hooks.find((h) => h.type === hook);
      if (!hookDef) continue;

      const storage = this.pluginStorages.get(pluginId) as StorageType;
      const implementationResult = await this.executeLocalHook(plugin, hook, {
        requestId,
        payload,
        playerId,
        roundIndex,
        storage,
        hookDef,
      });

      if (implementationResult) {
        results.push(implementationResult);
        if (implementationResult.storage !== undefined) {
          this.pluginStorages.set(pluginId, implementationResult.storage);
        } else if (implementationResult.patch) {
          this.pluginStorages.set(pluginId, {
            ...(storage as Record<string, unknown>),
            ...(implementationResult.patch as Record<string, unknown>),
          } as StorageType);
        }
        if (implementationResult.stopPropagation) {
          break;
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

      if (runnerResult !== undefined) {
        results.push(runnerResult as PluginHookResult<StorageType>);
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
      if (definition.isStateful) {
        resolvedRuntime = {
          isStateful: true,
          defaultState: this.normalizeDefaultStore(definition.defaultStore),
          ttlMs: runtime.ttlMs,
        };
      } else {
        resolvedRuntime = {
          isStateful: false,
          ttlMs: runtime.ttlMs,
        };
      }
    }

    const created = await this.runner.createLiveModule({
      manifest,
      isStateful: resolvedRuntime.isStateful,
    });

    const binding: RunnerLiveModuleBinding = {
      pluginId,
      moduleId: created.moduleId,
      manifest,
      runtime: resolvedRuntime,
      dependencies,
    };

    this.runnerPluginBinding.set(pluginId, binding);

    if (resolvedRuntime.isStateful) {
      await this.runner.setLiveModuleValue({
        moduleId: created.moduleId,
        key: '__state__',
        value: resolvedRuntime.defaultState,
      });
    }

    return binding;
  }

  private normalizeDefaultStore(defaultStore: unknown): unknown {
    if (Buffer.isBuffer(defaultStore)) {
      const text = defaultStore.toString('utf-8');
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    if (typeof defaultStore === 'string') {
      if (!defaultStore) return {};
      try {
        return JSON.parse(defaultStore);
      } catch {
        return defaultStore;
      }
    }
    return defaultStore;
  }
}
