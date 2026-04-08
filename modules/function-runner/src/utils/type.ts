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
  // Common
  Initialize,
  AddModules,
  SetDependencyVersions,
  DeleteModules,
  GetMissingDependencies,
  // function-runner related
  RunTask,
  // live-code related
  InitLiveModule,
  GetValueOfLiveModule,
  SetValueOfLiveModule,
  RunFunctionOfLiveModule,
  DeleteLiveModule,
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

export type WorkerPayload = {
  [WorkerMessageEnum.RunTask]: RunTaskPayload;
  [WorkerMessageEnum.AddModules]: Array<ModuleData>;
  [WorkerMessageEnum.DeleteModules]: ModuleData;
  [WorkerMessageEnum.SetDependencyVersions]: ModuleDependency[];
  [WorkerMessageEnum.GetMissingDependencies]: ModuleDependency[];

  [WorkerMessageEnum.InitLiveModule]: Omit<
    RunTaskPayload,
    'functionArgs' | 'options'
  >;
  [WorkerMessageEnum.GetValueOfLiveModule]: { name: string };
  [WorkerMessageEnum.SetValueOfLiveModule]: { name: string; value: any };
  [WorkerMessageEnum.RunFunctionOfLiveModule]: {
    functionName: string;
    functionArgs: {
      this: any;
      args: any[];
    };
  };
  [WorkerMessageEnum.DeleteLiveModule]: undefined;
};

export type RunTaskPayload = {
  code: string;
  options?: Partial<VMOptions>;
  functionArgs: VMFunctionArgs;
  dependencies?: Array<{
    name: string;
    version: number;
  }>;
};

export type ModuleData = {
  name: string;
  code: string;
  version: number;
  hash: bigint;
};
export type ModuleDependency = {
  name: string;
  version: number;
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
