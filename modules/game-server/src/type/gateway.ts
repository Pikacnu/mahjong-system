import type {
  RunnerCreateLiveModulePayload,
  MethodInfo,
  ResourceSource,
} from 'utils';

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
