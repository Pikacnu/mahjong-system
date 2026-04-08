import type { QuickJSRuntime } from 'quickjs-emscripten';
import {
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
  type RunTaskPayload,
  type WorkerMessage,
  type VMFunctionArgs,
} from '../utils/type';
import { getQuickJsRuntime, VM } from '../utils/vm';
import { ModuleManager } from '../manager/moduleManager';
import { handleSharedRuntimeMessage } from './shared_runtime_handler';

declare const self: Worker;

let isInitialized = false;
let moduleManager: ModuleManager = ModuleManager.getInstance();

let quickJSRuntime: QuickJSRuntime | null = null;
let vm: VM | null = null;

// Initialize runtime and VM on worker startup
async function initializeWorker() {
  if (!isInitialized) {
    quickJSRuntime = await getQuickJsRuntime(moduleManager);
    vm = new VM({ runtime: quickJSRuntime });
    isInitialized = true;
  }
}

await initializeWorker();

self.addEventListener('message', async (event) => {
  const message = event.data as WorkerMessage;
  switch (message.type) {
    case WorkerMessageEnum.AddModules:
    case WorkerMessageEnum.DeleteModules:
    case WorkerMessageEnum.SetDependencyVersions:
    case WorkerMessageEnum.GetMissingDependencies: {
      handleSharedRuntimeMessage(message, {
        moduleManager,
        postMessage: (response) => self.postMessage(response),
      });
      return;
    }
    case WorkerMessageEnum.RunTask: {
      if (!isInitialized || !vm) {
        self.postMessage({
          id: message.id,
          type: WorkerMessageEnum.RunTask,
          status: WorkerMessageStatusEnum.Error,
          payload: 'Worker not initialized',
        } as WorkerMessage);
        return;
      }

      try {
        const { code, options, functionArgs } =
          message.payload as RunTaskPayload;
        const result = vm.runCode(
          code,
          options,
          functionArgs as VMFunctionArgs,
        );
        self.postMessage({
          id: message.id,
          type: WorkerMessageEnum.RunTask,
          status: WorkerMessageStatusEnum.Success,
          payload: result,
        } as WorkerMessage);
      } catch (error) {
        self.postMessage({
          id: message.id,
          type: WorkerMessageEnum.RunTask,
          status: WorkerMessageStatusEnum.Error,
          payload: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerMessage);
      }
      return;
    }
    default: {
      self.postMessage({
        id: message.id,
        type: message.type,
        status: WorkerMessageStatusEnum.Error,
        payload: `Unknown message type: ${message.type}`,
      } as WorkerMessage);
      return;
    }
  }
});

self.addEventListener('close', async (event) => {});
