import type { CreateLiveModuleRequest } from 'proto/src/generated/services/runner';
import type { MethodInfo, ResourceSource } from 'utils';

export type RunnerGateway = {
  createLiveModule(
    payload: CreateLiveModuleRequest,
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
  getLiveModuleValue(payload: {
    moduleId: string;
    key: string;
  }): Promise<unknown>;
};

export type StorageGateway = {
  getPluginDefinition(payload: {
    methodInfo: MethodInfo;
    resourceSource?: ResourceSource;
  }): Promise<{
    defaultStore: unknown;
    dependencies: MethodInfo[];
  }>;
};
