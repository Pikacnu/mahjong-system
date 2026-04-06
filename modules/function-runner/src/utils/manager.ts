import {
  type WorkerEntry,
  type Task,
  type WorkerManagerOptions,
  type RunTaskPayload,
  type WorkerMessage,
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
} from './type';

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

export class WorkerManager {
  private workers: WorkerEntry[] = [];
  private taskQueue: TaskQueue<Task> = new TaskQueue();
  private pendingTasks = new Map<string, Task>();
  private options: WorkerManagerOptions = {
    MaxWorkers: 4,
    MinWorkers: 1,
    MaxTasksPerWorker: 1,
    TaskTimeoutMs: 5 * 1000,
  };

  constructor(options?: WorkerManagerOptions) {
    this.options = { ...this.options, ...options };
    for (let i = 0; i < this.options.MinWorkers!; i++) {
      this.workers.push(this.createWorker());
    }
  }

  createWorker() {
    const worker = new Worker(new URL('../worker/index.ts', import.meta.url));

    worker.addEventListener('message', (event: MessageEvent) => {
      const { id, status, payload } = event.data as WorkerMessage;
      if (!id) return;
      const pending = this.pendingTasks.get(id);

      if (pending) {
        if (pending.timeoutId) clearTimeout(pending.timeoutId);

        if (status === WorkerMessageStatusEnum.Success) {
          pending.resolve(payload);
        } else {
          pending.reject(new Error(String(payload)));
        }

        this.pendingTasks.delete(id);

        const workerEntry = this.workers.find((w) => w.worker === worker);
        if (workerEntry) {
          workerEntry.processingTasksCount--;
          this.scheduleNext();
        }
      }
    });

    return { worker, processingTasksCount: 0 };
  }

  async execute(payload: RunTaskPayload): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Bun.randomUUIDv7();
      const task: Task = { id, payload, resolve, reject };

      task.timeoutId = setTimeout(() => {
        const pending = this.pendingTasks.get(id);
        if (pending) {
          this.pendingTasks.delete(id);
          reject(
            new Error(
              `Task ${id} timeout after ${this.options.TaskTimeoutMs}ms`,
            ),
          );
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

    const message: WorkerMessage<WorkerMessageEnum.RunTask> = {
      id: task.id,
      type: WorkerMessageEnum.RunTask,
      payload: task.payload,
    };

    workerEntry.worker.postMessage(message);
  }

  destroy() {
    this.workers.forEach((worker) => {
      worker.worker.terminate();
    });
    this.pendingTasks.clear();
  }
}
