import type { ModuleManager } from '../manager/moduleManager';
import {
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
  type WorkerMessage,
  type ModuleData,
  type ModuleDependency,
} from '../utils/type';

export function handleSharedRuntimeMessage(
  message: WorkerMessage,
  {
    moduleManager,
    postMessage,
  }: {
    moduleManager: ModuleManager;
    postMessage: (message: WorkerMessage) => void;
  },
): boolean {
  const { id, type, payload } = message;

  switch (type) {
    case WorkerMessageEnum.AddModules: {
      try {
        (payload as ModuleData[]).forEach((module) => {
          moduleManager.addModule(module);
        });
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Success,
        } as WorkerMessage);
      } catch (error) {
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Error,
          payload: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerMessage);
      }
      return true;
    }
    case WorkerMessageEnum.DeleteModules: {
      try {
        moduleManager.deleteModule(
          (payload as ModuleData).name,
          (payload as ModuleData).version,
        );
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Success,
        } as WorkerMessage);
      } catch (error) {
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Error,
          payload: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerMessage);
      }
      return true;
    }
    case WorkerMessageEnum.SetDependencyVersions: {
      try {
        moduleManager.setDependenciesVersion(payload as ModuleDependency[]);
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Success,
        } as WorkerMessage);
      } catch (error) {
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Error,
          payload: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerMessage);
      }
      return true;
    }
    case WorkerMessageEnum.GetMissingDependencies: {
      try {
        const missingDependencies = (payload as ModuleDependency[]).filter(
          (dep) => {
            const module = moduleManager.getModule(dep.name);
            return !module || module.version !== dep.version;
          },
        );
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Success,
          payload: missingDependencies,
        } as WorkerMessage);
      } catch (error) {
        postMessage({
          id,
          type,
          status: WorkerMessageStatusEnum.Error,
          payload: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerMessage);
      }
      return true;
    }
    default:
      return false;
  }
}
