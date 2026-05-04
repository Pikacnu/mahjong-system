import { randomUUIDv7 } from 'bun';
import {
  GetResourceDataRequest,
  GetResourceDataResponse,
} from 'proto/src/generated/services/storage';
import { storageServiceClient } from '../grpc/storage-client';
import { unaryCall } from 'proto';
import {
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
  type WorkerMessage,
  type ModuleData,
  type ModuleDependency,
} from '../utils/type';
import { ModuleManager } from './moduleManager';

export type LiveModuleManifest = {
  name: string;
  version: number;
  description?: string;
  dependencies?: ModuleDependency[];
  // Note: defaultStore / defaultState should be passed in via call payload
  // by the Game Server (as function parameter), not stored here.
  // Optional defaultState may be provided at creation time for worker reference only.
  defaultState?: any;
};

export enum WorkerStatus {
  Idle,
  Occupied,
}

export class LiveModuleManager {
  private static instance: LiveModuleManager | null = null;

  private readonly moduleManager = ModuleManager.getInstance();

  // key is moduleId, value contains workerId, manifest and code
  private modulesById: Map<
    string,
    {
      workerId: string;
      searchKey: string;
      manifest: LiveModuleManifest;
      code: string;
    }
  > = new Map();

  // key is `${name}_${version}`, value is moduleId Array
  private modulesIndex: Map<string, string[]> = new Map();

  // stateless cleanup tracking (by module key)
  private statelessCleanupKeys: Set<string> = new Set();
  private statelessCleanupQueue: Map<
    string,
    { moduleId: string; lastExecuteDate: number }
  > = new Map();
  private statelessMaxIdleMs = 10 * 60 * 1000; // 10 minutes

  // stateful TTL tracking (per module id)
  private statefulTTLMap: Map<
    string,
    { moduleId: string; lastExecuteDate: number }
  > = new Map();
  private statefulMaxTTLMs = 60 * 60 * 1000; // 1 hour
  private statelessCleanupIntervalId: NodeJS.Timeout | null = null;

  // worker pool and status
  private workerPool: Map<string, Worker> = new Map();
  private workerStatus: Map<string, WorkerStatus> = new Map();
  private poolSize: number = 2;

  private inflightRequests: Map<
    string,
    {
      workerId: string;
      resolve: (value: WorkerMessage) => void;
      reject: (reason?: unknown) => void;
      timeoutId?: NodeJS.Timeout;
    }
  > = new Map();
  private requestTimeoutMs = 5 * 1000;

  public static getInstance(
    ...parms: Partial<ConstructorParameters<typeof LiveModuleManager>>
  ): LiveModuleManager {
    if (!this.instance) {
      this.instance = new LiveModuleManager(...parms);
    }
    return this.instance;
  }

  constructor(workerCount: number = 2) {
    this.poolSize = workerCount;
    for (let i = 0; i < this.poolSize; i++) {
      const currentWorkerId = randomUUIDv7();
      const worker = this.getWorker(currentWorkerId);
      this.workerPool.set(currentWorkerId, worker);
      this.workerStatus.set(currentWorkerId, WorkerStatus.Idle);
    }
    this.startStatelessLiveModulesClearInterval();
  }

  private startStatelessLiveModulesClearInterval() {
    if (this.statelessCleanupIntervalId) return;

    this.statelessCleanupIntervalId = setInterval(() => {
      const currentTime = Date.now();
      this.statefulTTLMap.forEach(({ moduleId, lastExecuteDate }, key) => {
        if (Math.abs(currentTime - lastExecuteDate) < this.statefulMaxTTLMs) {
          return;
        }
        this.removeLiveModule(moduleId).catch(() => {
          // no-op
        });
        this.statefulTTLMap.delete(key);
      });

      this.statelessCleanupQueue.forEach(
        ({ moduleId, lastExecuteDate }, key) => {
          if (
            Math.abs(currentTime - lastExecuteDate) < this.statelessMaxIdleMs
          ) {
            return;
          }
          this.removeLiveModule(moduleId).catch(() => {
            // no-op
          });
          this.statelessCleanupQueue.delete(key);
          this.statelessCleanupKeys.delete(key);
        },
      );
    }, this.statelessMaxIdleMs / 10);
  }

  private getWorker(workerId: string): Worker {
    const worker = new Worker(
      new URL('../worker/live_module_runner.ts', import.meta.url),
    );

    worker.addEventListener('message', (event: MessageEvent) => {
      this.processWorkerMessage(workerId, event);
    });

    worker.addEventListener('error', (event: ErrorEvent) => {
      this.handleWorkerFailure(workerId, worker, event.error || event.message);
    });

    worker.addEventListener('messageerror', () => {
      this.handleWorkerFailure(
        workerId,
        worker,
        'Worker message parsing failed',
      );
    });

    worker.addEventListener('close', () => {
      this.handleWorkerFailure(workerId, worker, 'Worker closed unexpectedly');
    });

    return worker;
  }

  private getModuleKey({
    name,
    version,
  }: Pick<LiveModuleManifest, 'name' | 'version'>): string {
    return `${name}_${version}`;
  }

  private acquireIdleWorkerId(): string | undefined {
    for (const [workerId, status] of this.workerStatus.entries()) {
      if (status === WorkerStatus.Idle) {
        this.workerStatus.set(workerId, WorkerStatus.Occupied);
        return workerId;
      }
    }
    return undefined;
  }

  private releaseWorker(workerId: string) {
    this.workerStatus.set(workerId, WorkerStatus.Idle);
  }

  private processWorkerMessage(workerId: string, event: MessageEvent) {
    const { id, status, payload } = event.data as WorkerMessage;
    if (!id) return;

    const pendingRequest = this.inflightRequests.get(id);
    if (!pendingRequest) return;

    if (pendingRequest.timeoutId) {
      clearTimeout(pendingRequest.timeoutId);
    }

    if (status === WorkerMessageStatusEnum.Success) {
      pendingRequest.resolve(event.data as WorkerMessage);
    } else {
      pendingRequest.reject(
        new Error(
          typeof payload === 'string' ? payload : 'Live worker request failed',
        ),
      );
    }

    this.inflightRequests.delete(id);
  }

  private handleWorkerFailure(
    workerId: string,
    worker: Worker,
    reason?: unknown,
  ) {
    const message =
      reason instanceof Error
        ? reason.message
        : `Worker failed: ${String(reason || 'unknown reason')}`;

    for (const [requestId, pending] of this.inflightRequests.entries()) {
      if (pending.workerId !== workerId) continue;
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.inflightRequests.delete(requestId);
    }

    for (const [moduleId, module] of this.modulesById.entries()) {
      if (module.workerId !== workerId) continue;
      this.modulesById.delete(moduleId);
      this.statefulTTLMap.delete(moduleId);
      const searchKey = module.searchKey;
      const currentIds = this.modulesIndex.get(searchKey) || [];
      const updatedIds = currentIds.filter(
        (currentId) => currentId !== moduleId,
      );
      if (updatedIds.length === 0) {
        this.modulesIndex.delete(searchKey);
      } else {
        this.modulesIndex.set(searchKey, updatedIds);
      }
    }

    this.releaseWorker(workerId);

    try {
      worker.terminate();
    } catch {
      // no-op
    }

    this.workerPool.set(workerId, this.getWorker(workerId));
  }

  private sendWorkerMessage<T extends WorkerMessageEnum>(
    workerId: string,
    type: T,
    payload?: unknown,
  ): Promise<WorkerMessage> {
    const worker = this.workerPool.get(workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }

    const id = randomUUIDv7();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.inflightRequests.has(id)) {
          this.inflightRequests.delete(id);
          reject(
            new Error(
              `Live worker request timeout after ${this.requestTimeoutMs}ms`,
            ),
          );
        }
      }, this.requestTimeoutMs);

      this.inflightRequests.set(id, {
        workerId,
        resolve,
        reject,
        timeoutId,
      });

      worker.postMessage({ id, type, payload } as WorkerMessage);
    });
  }

  private async setupDependencies(
    workerId: string,
    dependencies: ModuleDependency[],
  ) {
    if (dependencies.length === 0) return;

    await this.sendWorkerMessage(
      workerId,
      WorkerMessageEnum.SetDependencyVersions,
      dependencies,
    );

    const missingDependenciesResponse = await this.sendWorkerMessage(
      workerId,
      WorkerMessageEnum.GetMissingDependencies,
      dependencies,
    );

    const missingDependencies =
      (missingDependenciesResponse.payload as ModuleDependency[]) || [];
    if (missingDependencies.length === 0) {
      return;
    }

    const localCachedModules: ModuleData[] = [];
    const missingModulesToFetch: ModuleDependency[] = [];

    missingDependencies.forEach((dep) => {
      const moduleData = this.moduleManager.getModuleData(
        dep.name,
        dep.version,
      );
      if (moduleData) {
        localCachedModules.push(moduleData);
      } else {
        missingModulesToFetch.push(dep);
      }
    });

    if (localCachedModules.length > 0) {
      await this.sendWorkerMessage(
        workerId,
        WorkerMessageEnum.AddModules,
        localCachedModules,
      );
    }

    if (missingModulesToFetch.length === 0) {
      return;
    }

    const fetchedModules = await Promise.all(
      missingModulesToFetch.map(async (dep) => {
        const resourceResponse = (await unaryCall(
          storageServiceClient.getResourcesData.bind(storageServiceClient),
          {
            methodInfo: dep,
          } as GetResourceDataRequest,
        )) as GetResourceDataResponse;

        if (!resourceResponse.success || !resourceResponse.data) {
          throw new Error('Failed to fetch module data');
        }

        return {
          code: resourceResponse.data.code,
          ...dep,
          hash: Buffer.from(resourceResponse.data.hash).readBigInt64BE(),
        } satisfies ModuleData;
      }),
    );

    fetchedModules.forEach((module) => {
      this.moduleManager.addModule(module);
    });

    await this.sendWorkerMessage(
      workerId,
      WorkerMessageEnum.AddModules,
      fetchedModules,
    );
  }

  private getLiveModuleOrThrow(id: string) {
    const liveModule = this.modulesById.get(id);
    if (!liveModule) {
      throw new Error(`Live module not found: ${id}`);
    }
    return liveModule;
  }

  public async addLiveModule({
    code,
    defaultState,
    ...manifest
  }: {
    code: string;
    defaultState?: any;
  } & LiveModuleManifest): Promise<string> {
    const searchKey = this.getModuleKey(manifest);
    if (this.modulesIndex.has(searchKey)) {
      const availableModules = this.modulesIndex.get(searchKey)!;
      if (availableModules.length > 0) {
        const targetModules =
          availableModules[
            Math.floor(Math.random() * availableModules.length)
          ]!;
        this.statelessCleanupQueue.set(searchKey, {
          moduleId: targetModules,
          lastExecuteDate: Date.now(),
        });
        return targetModules;
      }
    }

    const currentModuleUUID = randomUUIDv7();
    const workerId = this.acquireIdleWorkerId();
    if (!workerId) {
      throw new Error('No idle worker available');
    }

    try {
      await this.setupDependencies(workerId, manifest.dependencies || []);
      await this.sendWorkerMessage(workerId, WorkerMessageEnum.InitLiveModule, {
        code,
        dependencies: manifest.dependencies || [],
        defaultState,
      });

      const storedManifest = {
        ...manifest,
        defaultState,
      } as LiveModuleManifest;

      this.modulesById.set(currentModuleUUID, {
        workerId: workerId,
        searchKey: searchKey,
        manifest: storedManifest,
        code,
      });
      this.modulesIndex.set(searchKey, [
        ...(this.modulesIndex.get(searchKey) || []),
        currentModuleUUID,
      ]);

      return currentModuleUUID;
    } catch (error) {
      this.releaseWorker(workerId);
      throw error;
    }
  }

  public async removeLiveModule(id: string) {
    const liveModule = this.modulesById.get(id);
    if (!liveModule) return;

    try {
      await this.sendWorkerMessage(
        liveModule.workerId,
        WorkerMessageEnum.DeleteLiveModule,
      );
    } finally {
      const searchKey = liveModule.searchKey;
      const moduleIds = this.modulesIndex.get(searchKey);
      if (moduleIds) {
        const updatedModuleIds = moduleIds.filter((v) => v !== id);
        if (updatedModuleIds.length === 0) {
          this.modulesIndex.delete(searchKey);
        } else {
          this.modulesIndex.set(searchKey, updatedModuleIds);
        }
      }
      this.modulesById.delete(id);
      this.statefulTTLMap.delete(id);
      this.releaseWorker(liveModule.workerId);
    }
  }

  public getStatelessLiveModuleIds(
    name: string,
    version: number,
  ): string[] | undefined {
    return this.modulesIndex.get(`${name}_${version}`);
  }

  public async callLiveModuleFunction({
    moduleId,
    functionName,
    functionArgs,
  }: {
    moduleId: string;
    functionName: string;
    functionArgs: {
      this: any;
      args: any[];
    };
  }) {
    const liveModule = this.getLiveModuleOrThrow(moduleId);
    // Stateful module TTL keepalive (keeps original call-based lifetime extension behavior)
    this.statefulTTLMap.set(moduleId, {
      moduleId,
      lastExecuteDate: Date.now(),
    });

    const moduleKey = this.getModuleKey(liveModule.manifest);
    if (!this.statelessCleanupKeys.has(moduleKey)) {
      this.statelessCleanupKeys.add(moduleKey);
      this.statelessCleanupQueue.set(moduleKey, {
        moduleId,
        lastExecuteDate: Date.now(),
      });
    } else {
      const existing = this.statelessCleanupQueue.get(moduleKey);
      if (existing) {
        existing.lastExecuteDate = Date.now();
      }
    }

    const response = await this.sendWorkerMessage(
      liveModule.workerId,
      WorkerMessageEnum.RunFunctionOfLiveModule,
      {
        functionName,
        functionArgs,
      },
    );
    return response.payload;
  }

  public async getLiveModuleValue({
    moduleId,
    name,
  }: {
    moduleId: string;
    name: string;
  }) {
    const liveModule = this.getLiveModuleOrThrow(moduleId);
    const response = await this.sendWorkerMessage(
      liveModule.workerId,
      WorkerMessageEnum.GetValueOfLiveModule,
      { name },
    );
    return response.payload;
  }

  public async setLiveModuleValue({
    moduleId,
    name,
    value,
  }: {
    moduleId: string;
    name: string;
    value: any;
  }) {
    const liveModule = this.getLiveModuleOrThrow(moduleId);
    await this.sendWorkerMessage(
      liveModule.workerId,
      WorkerMessageEnum.SetValueOfLiveModule,
      { name, value },
    );
    return true;
  }

  public async clean() {
    clearInterval(this.statelessCleanupIntervalId!);
    await Promise.allSettled(
      [...this.modulesById.keys()].map((moduleId) =>
        this.removeLiveModule(moduleId),
      ),
    );

    this.workerPool.forEach((worker) => {
      try {
        worker.terminate();
      } catch {}
    });

    this.workerPool.clear();
    this.workerStatus.clear();
    this.inflightRequests.clear();
    this.statelessCleanupKeys.clear();
    this.statelessCleanupQueue.clear();
    this.statefulTTLMap.clear();
    this.modulesById.clear();
    this.modulesIndex.clear();
  }
}
