import { GetResourceDataRequest } from 'proto/src/generated/services/storage';
import { storageServiceClient } from '../grpc/storage-client';
import {
  type WorkerEntry,
  type Task,
  type WorkerManagerOptions,
  type RunTaskPayload,
  type WorkerMessage,
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
  type ModuleDependency,
  type ModuleData,
} from '../utils/type';
import { ModuleManager } from './moduleManager';
import { unaryCall } from 'proto';
import { encodeToBytes } from 'utils';

export class TaskQueue<T> {
  private tasks: Array<T> = [];

  enqueue(task: T) {
    this.tasks.push(task);
  }

  next(): T | undefined {
    return this.tasks.shift();
  }

  get length() {
    return this.tasks.length;
  }

  isEmpty() {
    return this.tasks.length === 0;
  }

  get(key: keyof T, value: T[typeof key]): T | undefined {
    return this.tasks.find((task) => task[key] === value);
  }

  getAll(key: keyof T, value: T[typeof key]): T[] {
    return this.tasks.filter((task) => task[key] === value);
  }

  clear(): T[] | undefined {
    if (this.tasks.length === 0) return undefined;
    const clearedTasks = this.tasks;
    this.tasks = [];
    return clearedTasks;
  }
}

const moduleManager = ModuleManager.getInstance();

export class WorkerManager {
  private workers: WorkerEntry[] = [];
  private taskQueue: TaskQueue<Task> = new TaskQueue();
  private pendingTasks = new Map<string, Task>();
  private taskWorkerMap = new Map<string, WorkerEntry>();
  private options: WorkerManagerOptions = {
    MaxWorkers: 4,
    MinWorkers: 1,
    MaxTasksPerWorker: 1,
    TaskTimeoutMs: 5 * 1000,
  };
  private dependencieRequestPromiseMap = new Map<string, Promise<void>>();

  constructor(options?: WorkerManagerOptions) {
    this.options = { ...this.options, ...options };
    for (let i = 0; i < this.options.MinWorkers!; i++) {
      this.workers.push(this.createWorker());
    }
  }

  private finishTask(
    id: string,
    status: WorkerMessageStatusEnum,
    payload?: unknown,
  ) {
    const assignedWorker = this.taskWorkerMap.get(id);
    if (assignedWorker) {
      assignedWorker.processingTasksCount = Math.max(
        0,
        assignedWorker.processingTasksCount - 1,
      );
      this.taskWorkerMap.delete(id);
    }

    const pending = this.pendingTasks.get(id);
    if (!pending) {
      this.scheduleNext();
      return;
    }

    if (pending.timeoutId) clearTimeout(pending.timeoutId);

    if (status === WorkerMessageStatusEnum.Success) {
      pending.resolve(encodeToBytes(payload));
    } else {
      pending.reject(new Error(String(payload)));
    }

    this.pendingTasks.delete(id);
    this.scheduleNext();
  }

  /* run TaskFlow:
    1. check and setup dependencies (otherwise run task directly)
    2. ask worker for missing dependencies only
    3. post missing dependencies to worker if needed
    4. post task to worker
    5. handle worker response and errors
    ---
    Action Flow:
    1. Set Dependency Versions
    2. Get Missing Dependencies
    3. Add Modules (if needed)
    4. Run Task
  */

  private processWorkerMessage(event: MessageEvent) {
    const { id, status, payload, type } = event.data as WorkerMessage;
    if (!id) return;

    if (!status) {
      this.finishTask(
        id,
        WorkerMessageStatusEnum.Error,
        'No status in response',
      );
      return;
    }
    if (
      status === WorkerMessageStatusEnum.Error &&
      typeof payload === 'string'
    ) {
      return this.finishTask(id, WorkerMessageStatusEnum.Error, payload);
    }
    try {
      switch (type) {
        case WorkerMessageEnum.SetDependencyVersions: {
          // after setting dependency versions, ask worker to return only missing dependencies
          const currentTask = this.pendingTasks.get(id);
          if (!currentTask) {
            this.finishTask(
              id,
              WorkerMessageStatusEnum.Error,
              'No pending task found for dependency setup response',
            );
            return;
          }
          const getMissingDependenciesMessage: WorkerMessage<WorkerMessageEnum.GetMissingDependencies> =
            {
              id,
              type: WorkerMessageEnum.GetMissingDependencies,
              payload: currentTask.payload.dependencies || [],
            };
          const assignedWorker = this.taskWorkerMap.get(id);
          if (!assignedWorker) {
            throw new Error('No worker assigned for this task');
          }
          assignedWorker.worker.postMessage(getMissingDependenciesMessage);
          break;
        }
        case WorkerMessageEnum.GetMissingDependencies: {
          const unmetDependencies = payload as ModuleDependency[];
          const currentTask = this.pendingTasks.get(id);
          if (!currentTask) {
            this.finishTask(
              id,
              WorkerMessageStatusEnum.Error,
              'No pending task found for missing dependency response',
            );
            return;
          }

          const assignedWorker = this.taskWorkerMap.get(id);
          if (!assignedWorker) {
            throw new Error('No worker assigned for this task');
          }
          if (unmetDependencies.length === 0) {
            // no unmet dependencies, run task directly
            const runTaskMessage: WorkerMessage<WorkerMessageEnum.RunTask> = {
              id,
              type: WorkerMessageEnum.RunTask,
              payload: currentTask.payload,
            };
            assignedWorker.worker.postMessage(runTaskMessage);
            return;
          }
          const localCachedWorkerMissingModules: Array<ModuleData> = [];
          const dependenciesThatNeedToBeFetched: Array<ModuleDependency> = [];
          // first check local cache
          unmetDependencies.forEach((dep) => {
            const moduleData = moduleManager.getModuleData(
              dep.name,
              dep.version,
            );
            if (moduleData) {
              localCachedWorkerMissingModules.push(moduleData);
            } else {
              dependenciesThatNeedToBeFetched.push(dep);
            }
          });
          // send cached modules to worker
          if (localCachedWorkerMissingModules.length > 0) {
            const addModulesMessage: WorkerMessage<WorkerMessageEnum.AddModules> =
              {
                id,
                type: WorkerMessageEnum.AddModules,
                payload: localCachedWorkerMissingModules,
              };
            assignedWorker.worker.postMessage(addModulesMessage);
          }
          // fetch missing modules and send to worker
          let fetchingPromise: Array<Promise<ModuleData>> = [];
          if (dependenciesThatNeedToBeFetched.length > 0) {
            for (const dep of dependenciesThatNeedToBeFetched) {
              fetchingPromise.push(
                (async (dep: ModuleDependency): Promise<ModuleData> => {
                  const resourceData = await unaryCall(
                    storageServiceClient.getResourcesData.bind(
                      storageServiceClient,
                    ),
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
                  };
                }).bind(null, dep)(),
              );
            }
          }
          this.dependencieRequestPromiseMap.set(
            id,
            Promise.all(fetchingPromise)
              .then((modules) => {
                // add fetched modules to local cache
                modules.forEach((module) => {
                  moduleManager.addModule(module);
                });
                // send fetched modules to worker
                if (modules.length > 0) {
                  const addModulesMessage: WorkerMessage<WorkerMessageEnum.AddModules> =
                    {
                      id,
                      type: WorkerMessageEnum.AddModules,
                      payload: modules,
                    };
                  assignedWorker.worker.postMessage(addModulesMessage);
                }
                // clear the promise map
                this.dependencieRequestPromiseMap.delete(id);
              })
              .catch((error) => {
                this.dependencieRequestPromiseMap.delete(id);
                this.finishTask(
                  id,
                  WorkerMessageStatusEnum.Error,
                  `Failed to fetch dependencies: ${error instanceof Error ? error.message : String(error)}`,
                );
              }),
          );

          break;
        }
        case WorkerMessageEnum.AddModules: {
          if (!this.dependencieRequestPromiseMap.has(id)) {
            // if there is no fetching promise, it means the dependencies are from local cache, we can run task directly
            const assignedWorker = this.taskWorkerMap.get(id);
            if (!assignedWorker) {
              throw new Error('No worker assigned for this task');
            }
            const runTaskMessage: WorkerMessage<WorkerMessageEnum.RunTask> = {
              id,
              type: WorkerMessageEnum.RunTask,
              payload: this.pendingTasks.get(id)?.payload,
            };
            assignedWorker.worker.postMessage(runTaskMessage);
          }
          // if there is fetching promise, it means the dependencies are being fetched,
          // we can wait for the promise to resolve and then run task in the .then() callback
          break;
        }
        case WorkerMessageEnum.RunTask: {
          this.finishTask(id, status!, payload);
          break;
        }
      }
    } catch (error) {
      this.finishTask(
        id,
        WorkerMessageStatusEnum.Error,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private createWorker() {
    const worker = new Worker(
      new URL('../worker/function_runner.ts', import.meta.url),
    );

    worker.addEventListener('message', this.processWorkerMessage.bind(this));

    worker.addEventListener('error', (event: ErrorEvent) => {
      this.handleWorkerFailure(worker, event.error || event.message);
    });

    worker.addEventListener('messageerror', () => {
      this.handleWorkerFailure(worker, 'Worker message parsing failed');
    });

    worker.addEventListener('close', () => {
      this.handleWorkerFailure(worker, 'Worker closed unexpectedly');
    });

    return { worker, processingTasksCount: 0 };
  }

  private handleWorkerFailure(worker: Worker, reason?: unknown) {
    const workerIndex = this.workers.findIndex((w) => w.worker === worker);
    if (workerIndex === -1) return;

    const failedWorkerEntry = this.workers[workerIndex];
    if (!failedWorkerEntry) return;
    const message =
      reason instanceof Error
        ? reason.message
        : `Worker failed: ${String(reason || 'unknown reason')}`;

    const affectedTaskIds = Array.from(this.taskWorkerMap.entries())
      .filter(([, entry]) => entry.worker === worker)
      .map(([taskId]) => taskId);

    affectedTaskIds.forEach((taskId) => {
      this.taskWorkerMap.delete(taskId);
      const pending = this.pendingTasks.get(taskId);
      if (!pending) return;
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.pendingTasks.delete(taskId);
    });

    failedWorkerEntry.processingTasksCount = 0;

    try {
      worker.terminate();
    } catch {
      // no-op: worker may already be terminated
    }

    this.workers[workerIndex] = this.createWorker();
    this.scheduleNext();
  }

  async execute(payload: RunTaskPayload): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Bun.randomUUIDv7();
      const task: Task = { id, payload, resolve, reject };

      task.timeoutId = setTimeout(() => {
        const pending = this.pendingTasks.get(id);
        if (pending) {
          this.pendingTasks.delete(id);
          const assignedWorker = this.taskWorkerMap.get(id);
          if (assignedWorker) {
            assignedWorker.processingTasksCount = Math.max(
              0,
              assignedWorker.processingTasksCount - 1,
            );
            this.taskWorkerMap.delete(id);
          }
          reject(
            new Error(
              `Task ${id} timeout after ${this.options.TaskTimeoutMs}ms`,
            ),
          );
          this.scheduleNext();
        }
      }, this.options.TaskTimeoutMs);

      this.taskQueue.enqueue(task);
      this.scheduleNext();
    });
  }

  private scheduleNext() {
    if (this.taskQueue.isEmpty()) return;

    const availableWorker = this.workers.find(
      (w) => w.processingTasksCount < this.options.MaxTasksPerWorker!,
    );

    if (availableWorker) {
      const task = this.taskQueue.next()!;
      this.runTask(availableWorker, task);
    }
  }

  private runTask(workerEntry: WorkerEntry, task: Task) {
    workerEntry.processingTasksCount++;
    this.pendingTasks.set(task.id, task);
    this.taskWorkerMap.set(task.id, workerEntry);

    // Setup Dependency
    if (task.payload.dependencies) {
      // Dependency setup must carry task id so worker replies can be correlated.
      workerEntry.worker.postMessage({
        id: task.id,
        type: WorkerMessageEnum.SetDependencyVersions,
        payload: task.payload.dependencies,
      } as WorkerMessage);
    } else {
      const message: WorkerMessage<WorkerMessageEnum.RunTask> = {
        id: task.id,
        type: WorkerMessageEnum.RunTask,
        payload: task.payload,
      };

      workerEntry.worker.postMessage(message);
    }
  }

  destroy() {
    this.workers.forEach((worker) => {
      worker.worker.terminate();
    });
    this.pendingTasks.clear();
    this.taskWorkerMap.clear();
  }
}
