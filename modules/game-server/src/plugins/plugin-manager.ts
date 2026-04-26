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

export const lifeCycleHooks: LifecycleHookType[] = [
  LifecycleHookType.GameStart,
  LifecycleHookType.GameEnd,
  LifecycleHookType.RoundStart,
  LifecycleHookType.RoundEnd,
];

export const decisionHooks: DecisionHookType[] = [
  DecisionHookType.EvaluateAvailableActions,
  DecisionHookType.ValidateAction,
  DecisionHookType.ResolveAction,
];

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

  public getHookPipeline(hookType: HookType): {
    pluginId: string;
    priority: number;
    isParallelable?: boolean;
  }[] {
    const handlers = this.hookHandlers.get(hookType) || [];
    // Observability: quick metric about pipeline composition
    // eslint-disable-next-line no-console
    console.debug(
      `[PluginManager] getHookPipeline hook=${String(hookType)} handlers=${handlers.length}`,
    );

    const isDecisionHook = Object.values(DecisionHookType).includes(
      hookType as DecisionHookType,
    );

    // Variable Name -> Array of { pluginId, priority }
    const modifyVariableMap: Map<
      string,
      {
        pluginId: string;
        priority: number;
      }[]
    > = new Map();
    const useVariableMap: Map<
      string,
      {
        pluginId: string;
        priority: number;
      }[]
    > = new Map();

    handlers.forEach((handler) => {
      const plugin = this.plugins.get(handler.pluginId);
      if (!plugin) return null;

      const currentHookDef =
        plugin.instance.implementation[
          isDecisionHook ? 'decision' : 'lifecycle'
        ];
      if (!currentHookDef) return null;
      if (currentHookDef.ReadGlobalStorageValues) {
        currentHookDef.ReadGlobalStorageValues.forEach((key) => {
          const current = useVariableMap.get(key) || [];
          useVariableMap.set(key, [
            ...current,
            {
              pluginId: handler.pluginId,
              priority: handler.priority,
            },
          ]);
        });
      }
      if (currentHookDef.SetGlobalStorageValues) {
        currentHookDef.SetGlobalStorageValues.forEach((key) => {
          const current = modifyVariableMap.get(key) || [];
          modifyVariableMap.set(key, [
            ...current,
            {
              pluginId: handler.pluginId,
              priority: handler.priority,
            },
          ]);
        });
      }

      return null;
    });

    // Sort plugins using a 4-step approach (performance-minded):
    // 1) compute edit count per variable
    // 2) precompute per-plugin metadata and per-key priority maps
    // 3) comparator:
    //    - modifiers before non-modifiers
    //    - if both modify the same variable(s), compare per-variable priority (variables with higher edit counts first)
    //    - if no shared variable, compare handler priority (higher first), then max variable edit count, then modify count
    // 4) if neither modifies, compare use priority, then use count; final tie-breaker: registration index

    const variableEditCount = new Map<string, number>();
    for (const [key, arr] of modifyVariableMap.entries()) {
      variableEditCount.set(
        key,
        (variableEditCount.get(key) ?? 0) + arr.length,
      );
    }

    // per-key fast lookup maps: key -> (pluginId -> priority)
    const perKeyModifyPriority = new Map<string, Map<string, number>>();
    for (const [key, arr] of modifyVariableMap.entries()) {
      const m = new Map<string, number>();
      for (const it of arr) m.set(it.pluginId, it.priority);
      perKeyModifyPriority.set(key, m);
    }
    const perKeyUsePriority = new Map<string, Map<string, number>>();
    for (const [key, arr] of useVariableMap.entries()) {
      const m = new Map<string, number>();
      for (const it of arr) m.set(it.pluginId, it.priority);
      perKeyUsePriority.set(key, m);
    }

    type PluginMeta = {
      index: number;
      modifyKeys: Set<string>;
      useKeys: Set<string>;
      modifyCount: number;
      useCount: number;
      modifyMax?: number;
      useMax?: number;
      maxEditCount?: number;
    };

    const pluginMeta = new Map<string, PluginMeta>();
    handlers.forEach((h, idx) =>
      pluginMeta.set(h.pluginId, {
        index: idx,
        modifyKeys: new Set(),
        useKeys: new Set(),
        modifyCount: 0,
        useCount: 0,
      }),
    );

    for (const [key, arr] of modifyVariableMap.entries()) {
      const editCount = arr.length;
      for (const item of arr) {
        const m = pluginMeta.get(item.pluginId);
        if (!m) continue;
        m.modifyKeys.add(key);
        m.modifyCount++;
        m.modifyMax = Math.max(m.modifyMax ?? -Infinity, item.priority);
        m.maxEditCount = Math.max(m.maxEditCount ?? -Infinity, editCount);
      }
    }

    for (const [key, arr] of useVariableMap.entries()) {
      for (const item of arr) {
        const m = pluginMeta.get(item.pluginId);
        if (!m) continue;
        m.useKeys.add(key);
        m.useCount++;
        m.useMax = Math.max(m.useMax ?? -Infinity, item.priority);
      }
    }

    const sorted = [...handlers].sort((a, b) => {
      const A = pluginMeta.get(a.pluginId)!;
      const B = pluginMeta.get(b.pluginId)!;

      const aMod = A.modifyCount > 0;
      const bMod = B.modifyCount > 0;
      if (aMod !== bMod) return aMod ? -1 : 1;

      if (aMod && bMod) {
        // if they share modified keys, compare those keys first (keys with higher edit counts first)
        const shared = [...A.modifyKeys].filter((k) => B.modifyKeys.has(k));
        if (shared.length > 0) {
          shared.sort(
            (k1, k2) => variableEditCount.get(k2)! - variableEditCount.get(k1)!,
          );
          for (const key of shared) {
            const aPri = perKeyModifyPriority.get(key)!.get(a.pluginId)!;
            const bPri = perKeyModifyPriority.get(key)!.get(b.pluginId)!;
            if (aPri !== bPri) return bPri - aPri;
          }
          return A.index - B.index;
        }

        // no shared keys: primary by handler priority (higher first), then by max var edit count, then by modifyCount
        if (a.priority !== b.priority) return b.priority - a.priority;
        const aMaxEdit = A.maxEditCount ?? -Infinity;
        const bMaxEdit = B.maxEditCount ?? -Infinity;
        if (aMaxEdit !== bMaxEdit) return bMaxEdit - aMaxEdit;
        if (A.modifyCount !== B.modifyCount)
          return B.modifyCount - A.modifyCount;
        return A.index - B.index;
      }

      // neither modifies: compare use priority, then use count, then index
      const aUseMax = A.useMax ?? -Infinity;
      const bUseMax = B.useMax ?? -Infinity;
      if (aUseMax !== bUseMax) return bUseMax - aUseMax;
      if (A.useCount !== B.useCount) return B.useCount - A.useCount;
      return A.index - B.index;
    });

    return sorted.map((handler) => ({
      pluginId: handler.pluginId,
      priority: handler.priority,
      isParallelable: pluginMeta.get(handler.pluginId)?.modifyCount === 0,
    }));
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
    // Observability: hook execution start
    // eslint-disable-next-line no-console
    console.info(
      `[PluginManager] runHook start hook=${String(hook)} requestId=${requestId} playerId=${playerId ?? 'N/A'}`,
    );

    const pipeLine = this.getHookPipeline(hook);
    const parallelableHook = pipeLine.filter((h) => h.isParallelable || false);
    const sequentialHook = pipeLine.filter((h) => !h.isParallelable);
    const abortController = new AbortController();
    const { signal } = abortController;

    const hookExecution = async (
      pluginId: string,
      hookDef: PluginHookDefinition,
      plugin: PluginInstance<StorageType>,
      storage: StorageType,
      mutateStorage = false,
    ) => {
      if (signal.aborted) return undefined;

      const injectionValues = plugin.usedGlobalStorageKeys.reduce(
        (acc, key) => {
          acc[key] = this.getGlobalStorageValue(key);
          return acc;
        },
        {} as Record<string, unknown>,
      );

      const mergedStorage = { ...storage, ...injectionValues };
      this.pluginStorages.set(pluginId, mergedStorage);

      if (signal.aborted) return undefined;

      const implementationResult = await this.executeLocalHook(plugin, hook, {
        requestId,
        payload,
        playerId,
        roundIndex,
        storage: mergedStorage,
        hookDef,
      });

      if (implementationResult) {
        const out = {
          ...implementationResult,
          pluginId,
        } as WithPluginId<PluginHookResult<StorageType>>;
        if (
          mutateStorage &&
          implementationResult.storagePatch &&
          Array.isArray(implementationResult.storagePatch) &&
          implementationResult.storagePatch.length > 0
        ) {
          this.applyStoragePatch(plugin, implementationResult.storagePatch);
        }
        return out;
      }

      if (signal.aborted) return undefined;

      const runnerResult = await this.executeRunnerHook(
        pluginId,
        plugin.runtime,
        hook,
        {
          requestId,
          payload,
        },
        signal,
      );

      if (runnerResult === undefined) return undefined;

      const out = {
        ...runnerResult,
        pluginId,
      } as WithPluginId<PluginHookResult<StorageType>>;
      if (
        mutateStorage &&
        runnerResult.storagePatch &&
        Array.isArray(runnerResult.storagePatch) &&
        runnerResult.storagePatch.length > 0
      ) {
        this.applyStoragePatch(
          plugin,
          runnerResult.storagePatch as StoragePatch<StorageType>[],
        );
      }
      return out;
    };

    for (const { pluginId } of sequentialHook) {
      if (signal.aborted) break;

      const registered = this.plugins.get(pluginId);
      if (!registered) continue;

      const plugin = registered.instance as PluginInstance<StorageType>;
      const hookDef = plugin.hooks.find((h) => h.type === hook);
      if (!hookDef) continue;

      const storage = this.pluginStorages.get(pluginId) as StorageType;
      const executionResult = await hookExecution(
        pluginId,
        hookDef,
        plugin,
        storage,
        true,
      );

      if (executionResult) {
        results.push(executionResult);
        if (executionResult.stopPropagation) {
          abortController.abort();
          break;
        }
      }
    }

    if (!signal.aborted && parallelableHook.length > 0) {
      const promises = parallelableHook.map(async ({ pluginId }) => {
        if (signal.aborted) return null;
        const registered = this.plugins.get(pluginId);
        if (!registered) return null;
        const plugin = registered.instance as PluginInstance<StorageType>;
        const hookDef = plugin.hooks.find((h) => h.type === hook);
        if (!hookDef) return null;
        const storage = this.pluginStorages.get(pluginId) as StorageType;
        const res = await hookExecution(pluginId, hookDef, plugin, storage);
        if (res?.stopPropagation) abortController.abort();
        return res;
      });

      const settled = await Promise.allSettled(promises);
      const values = settled
        .filter(
          (r) =>
            r.status === 'fulfilled' &&
            (r as PromiseFulfilledResult<any>).value != null,
        )
        .map(
          (r) =>
            (
              r as PromiseFulfilledResult<WithPluginId<
                PluginHookResult<StorageType>
              > | null>
            ).value,
        )
        .filter((v) => v != null) as WithPluginId<
        PluginHookResult<StorageType>
      >[];
      results.push(...values);
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
    signal?: AbortSignal,
  ): Promise<PluginHookResult<StorageType> | undefined> {
    if (signal?.aborted) return undefined;

    let binding = this.runnerPluginBinding.get(pluginId);
    if (!binding) {
      binding = await this.createRunnerBinding(pluginId, runtime);
    }

    if (signal?.aborted) return undefined;

    try {
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

      if (signal?.aborted) return undefined;

      if (response && typeof response === 'object') {
        return response as PluginHookResult<StorageType>;
      }
      return undefined;
    } catch (err) {
      if (signal?.aborted) return undefined;
      throw err;
    }
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
    }

    const created = await this.runner.createLiveModule({
      manifest,
    });

    // If we have a defaultState for the runtime, push it into the runner's live module store
    // so the VM has initial state available. This uses SetLiveModuleValue because
    // CreateLiveModule request doesn't carry runtime state in the current proto.
    if (
      resolvedRuntime &&
      (resolvedRuntime as any).defaultState !== undefined
    ) {
      try {
        // eslint-disable-next-line no-console
        console.info(
          `[PluginManager] initializing default state for plugin=${pluginId} module=${created.moduleId}`,
        );
        await this.runner.setLiveModuleValue({
          moduleId: created.moduleId,
          key: '__state__',
          value: (resolvedRuntime as any).defaultState,
        });
        // keep local cache in sync
        this.pluginStorages.set(
          pluginId,
          (resolvedRuntime as any).defaultState as unknown,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[PluginManager] failed to initialize default state for ${pluginId}`,
          err,
        );
      }
    }

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
    plugin: PluginInstance<T>,
    patches: StoragePatch<T>[],
  ) {
    for (const patch of patches) {
      let currentValue: unknown;
      const keyString = patch.key.toString();
      switch (patch.type) {
        case StoragePatchType.Global: {
          if (!plugin.usedGlobalStorageKeys.includes(keyString)) {
            // eslint-disable-next-line no-console
            console.error('Key not registered for plugin');
            break;
          }
          currentValue = this.getGlobalStorageValue(keyString);
          if (this.validValue(patch.value, currentValue)) {
            // eslint-disable-next-line no-console
            console.debug(
              `[PluginManager] apply global patch key=${keyString} plugin=${plugin.manifest.id}`,
            );
            this.setGlobalStorageValue(keyString, patch.value);
          } else {
            // eslint-disable-next-line no-console
            console.error('Invalid value type for global storage');
          }
          break;
        }
        case StoragePatchType.Plugin: {
          // patch.key is a key inside the plugin's storage object
          const pluginId = plugin.manifest.id;
          const currentStore = this.pluginStorages.get(pluginId) as
            | Record<string, unknown>
            | undefined;
          const prop = String(patch.key);
          const currentPropValue = currentStore
            ? currentStore[prop]
            : undefined;
          if (this.validValue(patch.value, currentPropValue)) {
            // eslint-disable-next-line no-console
            console.debug(
              `[PluginManager] apply plugin patch plugin=${pluginId} key=${prop}`,
            );
            const newStore = {
              ...((currentStore as Record<string, unknown>) || {}),
              [prop]: patch.value,
            };
            this.pluginStorages.set(pluginId, newStore as unknown as T);
          } else {
            // eslint-disable-next-line no-console
            console.error('Invalid value type for plugin storage');
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
