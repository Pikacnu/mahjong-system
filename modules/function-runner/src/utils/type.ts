export type VMOptions = {
  entryFunctionName: string;
  executeType: string;
};

export type VMFunctionArgs = {
  this: any;
  args: any[];
};

export type WorkerManagerOptions = {
  MaxWorkers?: number;
  MinWorkers?: number;
  MaxTasksPerWorker?: number;
  TaskTimeoutMs?: number;
};

export enum WorkerMessageEnum {
  RunTask,
  Initialize,
}

export enum WorkerMessageStatusEnum {
  Success = 'Success',
  Error = 'Error',
}

export type WorkerMessage<T extends keyof WorkerPayload = any> = {
  id?: string;
  type: T;
  payload?: WorkerPayload[T];
  status?: WorkerMessageStatusEnum;
};

type WorkerPayload = {
  [WorkerMessageEnum.RunTask]: RunTaskPayload;
};

export type RunTaskPayload = {
  code: string;
  options?: Partial<VMOptions>;
  functionArgs: VMFunctionArgs;
};

export type WorkerEntry = {
  worker: Worker;
  processingTasksCount: number;
};

export type Task = {
  id: string;
  payload: RunTaskPayload;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId?: NodeJS.Timeout;
};
