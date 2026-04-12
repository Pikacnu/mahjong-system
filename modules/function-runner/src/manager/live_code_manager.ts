import { randomUUIDv7 } from 'bun';
import { GetResourceDataRequest } from 'proto/src/generated/services/storage';
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
} & (
  | {
      isStateful: true;
      defaultState: any;
    }
  | {
      isStateful: false;
    }
);

export enum WorkerStatus {
  Idle,
  Occupied,
}

export class LiveModuleManager {
  private static instance: LiveModuleManager | null = null;

  private readonly moduleManager = ModuleManager.getInstance();

  // key is moduleId, value contains workerId, manifest and code
  private liveModules: Map<
    string,
    {
      workerId: string;
      searchKey: string;
      manifest: LiveModuleManifest;
      code: string;
    }
  > = new Map();

  // key is `${name}_${version}`, value is moduleId
  private statelessLiveModules: Map<string, string> = new Map();

  // key is `${name}_${version}_${isStateful ? 'stateful' : 'stateless'}`, value is moduleId
  private liveModulesSearchMap: Map<string, string[]> = new Map();

  private statelessLiveModulesClearIdSet: Set<string> = new Set();
  private statelessLiveModulesClearQueue: Map<
    string,
    { moduleId: string; lastExecuteDate: number }
  > = new Map();
  private statelessLiveModulesMaxIdleTime = 10 * 60 * 1000; // 10 minutes
  private statefulLiveModulesTTLQueue: Map<
    string,
    { moduleId: string; lastExecuteDate: number }
  > = new Map();
  private statefulLiveModulesMaxTTL = 60 * 60 * 1000; // 1 hour
  private statelessLiveModulesClearIntervalId: NodeJS.Timeout | null = null;

  private workers: Map<string, Worker> = new Map();
  private workerState: Map<string, WorkerStatus> = new Map();
  private workerCount: number = 2;
  private pendingRequests: Map<
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
    this.workerCount = workerCount;
    for (let i = 0; i < this.workerCount; i++) {
      const currentWorkerId = randomUUIDv7();
      const worker = this.getWorker(currentWorkerId);
      this.workers.set(currentWorkerId, worker);
      this.workerState.set(currentWorkerId, WorkerStatus.Idle);
    }
    this.startStatelessLiveModulesClearInterval();
  }

  private startStatelessLiveModulesClearInterval() {
    if (this.statelessLiveModulesClearIntervalId) return;

    this.statelessLiveModulesClearIntervalId = setInterval(() => {
      const currentTime = Date.now();

      this.statefulLiveModulesTTLQueue.forEach(
        ({ moduleId, lastExecuteDate }, key) => {
          if (
            Math.abs(currentTime - lastExecuteDate) <
            this.statefulLiveModulesMaxTTL
          ) {
            return;
          }
          this.removeLiveModule(moduleId).catch(() => {
            // no-op
          });
          this.statefulLiveModulesTTLQueue.delete(key);
        },
      );

      this.statelessLiveModulesClearQueue.forEach(
        ({ moduleId, lastExecuteDate }, key) => {
          if (
            Math.abs(currentTime - lastExecuteDate) <
            this.statelessLiveModulesMaxIdleTime
          ) {
            return;
          }
          this.removeLiveModule(moduleId).catch(() => {
            // no-op
          });
          this.statelessLiveModulesClearQueue.delete(key);
          this.statelessLiveModulesClearIdSet.delete(key);
        },
      );
    }, this.statelessLiveModulesMaxIdleTime / 10);
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

  private getModuleSearchKey({
    name,
    version,
    isStateful,
  }: Pick<LiveModuleManifest, 'name' | 'version' | 'isStateful'>): string {
    return `${name}_${version}_${isStateful ? 'stateful' : 'stateless'}`;
  }

  private getLiveModuleKey({
    name,
    version,
  }: Pick<LiveModuleManifest, 'name' | 'version'>): string {
    return `${name}_${version}`;
  }

  private getIdleWorkerId(): string | undefined {
    for (const [workerId, status] of this.workerState.entries()) {
      if (status === WorkerStatus.Idle) {
        this.workerState.set(workerId, WorkerStatus.Occupied);
        return workerId;
      }
    }
    return undefined;
  }

  private releaseWorker(workerId: string) {
    this.workerState.set(workerId, WorkerStatus.Idle);
  }

  private processWorkerMessage(workerId: string, event: MessageEvent) {
    const { id, status, payload } = event.data as WorkerMessage;
    if (!id) return;

    const pendingRequest = this.pendingRequests.get(id);
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

    this.pendingRequests.delete(id);
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

    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.workerId !== workerId) continue;
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.pendingRequests.delete(requestId);
    }

    for (const [moduleId, module] of this.liveModules.entries()) {
      if (module.workerId !== workerId) continue;
      this.liveModules.delete(moduleId);
      this.statefulLiveModulesTTLQueue.delete(moduleId);
      if (!module.manifest.isStateful) {
        this.statelessLiveModules.delete(
          this.getLiveModuleKey(module.manifest),
        );
      }
      const searchKey = module.searchKey;
      const currentIds = this.liveModulesSearchMap.get(searchKey) || [];
      const updatedIds = currentIds.filter(
        (currentId) => currentId !== moduleId,
      );
      if (updatedIds.length === 0) {
        this.liveModulesSearchMap.delete(searchKey);
      } else {
        this.liveModulesSearchMap.set(searchKey, updatedIds);
      }
    }

    this.releaseWorker(workerId);

    try {
      worker.terminate();
    } catch {
      // no-op
    }

    this.workers.set(workerId, this.getWorker(workerId));
  }

  private sendWorkerMessage<T extends WorkerMessageEnum>(
    workerId: string,
    type: T,
    payload?: unknown,
  ): Promise<WorkerMessage> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }

    const id = randomUUIDv7();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(
            new Error(
              `Live worker request timeout after ${this.requestTimeoutMs}ms`,
            ),
          );
        }
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
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
        const resourceData = await unaryCall(
          storageServiceClient.getResourcesData.bind(storageServiceClient),
          {
            resources: {
              methodInfo: dep,
            },
          } as GetResourceDataRequest,
        );

        return {
          ...resourceData,
          ...dep,
          hash: Buffer.from(resourceData.hash).readBigInt64BE(),
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
    const liveModule = this.liveModules.get(id);
    if (!liveModule) {
      throw new Error(`Live module not found: ${id}`);
    }
    return liveModule;
  }

  public async addLiveModule({
    code,
    ...manifest
  }: {
    code: string;
  } & LiveModuleManifest): Promise<string> {
    const isStateful = manifest.isStateful;
    const searchKey = this.getModuleSearchKey(manifest);
    if (!isStateful && this.liveModulesSearchMap.has(searchKey)) {
      return this.liveModulesSearchMap.get(searchKey)![0]!;
    }
    const currentModuleUUID = randomUUIDv7();
    const workerId = this.getIdleWorkerId();
    if (!workerId) {
      throw new Error('No idle worker available');
    }

    if (!isStateful) {
      this.statelessLiveModules.set(
        `${manifest.name}_${manifest.version}`,
        currentModuleUUID,
      );
    }

    try {
      await this.setupDependencies(workerId, manifest.dependencies || []);
      await this.sendWorkerMessage(workerId, WorkerMessageEnum.InitLiveModule, {
        code,
        dependencies: manifest.dependencies || [],
      });

      this.liveModules.set(currentModuleUUID, {
        workerId: workerId,
        searchKey: searchKey,
        manifest,
        code,
      });
      this.liveModulesSearchMap.set(searchKey, [
        ...(this.liveModulesSearchMap.get(searchKey) || []),
        currentModuleUUID,
      ]);
      if (isStateful) {
        this.statefulLiveModulesTTLQueue.set(currentModuleUUID, {
          moduleId: currentModuleUUID,
          lastExecuteDate: Date.now(),
        });
      }

      return currentModuleUUID;
    } catch (error) {
      this.releaseWorker(workerId);
      throw error;
    }
  }

  public async removeLiveModule(id: string) {
    const liveModule = this.liveModules.get(id);
    if (!liveModule) return;

    try {
      await this.sendWorkerMessage(
        liveModule.workerId,
        WorkerMessageEnum.DeleteLiveModule,
      );
    } finally {
      const searchKey = liveModule.searchKey;
      const moduleIds = this.liveModulesSearchMap.get(searchKey);
      if (moduleIds) {
        const updatedModuleIds = moduleIds.filter((v) => v !== id);
        if (updatedModuleIds.length === 0) {
          this.liveModulesSearchMap.delete(searchKey);
        } else {
          this.liveModulesSearchMap.set(searchKey, updatedModuleIds);
        }
      }
      this.liveModules.delete(id);
      this.statefulLiveModulesTTLQueue.delete(id);
      this.releaseWorker(liveModule.workerId);
      if (!liveModule.manifest.isStateful) {
        const searchKey = this.getLiveModuleKey(liveModule.manifest);
        this.statelessLiveModules.delete(searchKey);
        if (!this.statelessLiveModulesClearIdSet.has(searchKey)) {
          this.statelessLiveModulesClearIdSet.add(searchKey);
          this.statelessLiveModulesClearQueue.set(searchKey, {
            moduleId: id,
            lastExecuteDate: Date.now(),
          });
        }
      }
    }
  }

  public getStatelessLiveModuleId(
    name: string,
    version: number,
  ): string | undefined {
    return this.statelessLiveModules.get(`${name}_${version}`);
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
    if (!liveModule.manifest.isStateful) {
      throw new Error('callLiveModule is only for stateful live module');
    }

    // Stateful module TTL keepalive (keeps original call-based lifetime extension behavior)
    this.statefulLiveModulesTTLQueue.set(moduleId, {
      moduleId,
      lastExecuteDate: Date.now(),
    });

    const moduleKey = this.getLiveModuleKey(liveModule.manifest);
    if (!this.statelessLiveModulesClearIdSet.has(moduleKey)) {
      this.statelessLiveModulesClearIdSet.add(moduleKey);
      this.statelessLiveModulesClearQueue.set(moduleKey, {
        moduleId,
        lastExecuteDate: Date.now(),
      });
    } else {
      const existing = this.statelessLiveModulesClearQueue.get(moduleKey);
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
    if (!liveModule.manifest.isStateful) {
      throw new Error('getLiveModuleValue is only for stateful live module');
    }
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
    if (!liveModule.manifest.isStateful) {
      throw new Error('setLiveModuleValue is only for stateful live module');
    }
    await this.sendWorkerMessage(
      liveModule.workerId,
      WorkerMessageEnum.SetValueOfLiveModule,
      { name, value },
    );
    return true;
  }

  public async clean() {
    clearInterval(this.statelessLiveModulesClearIntervalId!);
    await Promise.allSettled(
      [...this.liveModules.keys()].map((moduleId) =>
        this.removeLiveModule(moduleId),
      ),
    );

    this.workers.forEach((worker) => {
      try {
        worker.terminate();
      } catch {}
    });

    this.workers.clear();
    this.workerState.clear();
    this.pendingRequests.clear();
    this.statelessLiveModulesClearIdSet.clear();
    this.statelessLiveModulesClearQueue.clear();
    this.statefulLiveModulesTTLQueue.clear();
    this.liveModules.clear();
    this.liveModulesSearchMap.clear();
    this.statelessLiveModules.clear();
  }
}
