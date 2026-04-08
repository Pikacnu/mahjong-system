import type { QuickJSRuntime } from 'quickjs-emscripten';
import {
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
  type WorkerMessage,
  type WorkerPayload,
} from '../utils/type';
import { getQuickJsRuntime, durableVM } from '../utils/vm';
import { ModuleManager } from '../manager/moduleManager';
import { handleSharedRuntimeMessage } from './shared_runtime_handler';

declare const self: Worker;

let isInitialized = false;
let moduleManager: ModuleManager = ModuleManager.getInstance();

let quickJSRuntime: QuickJSRuntime | null = null;
let vm: durableVM | null = null;

// Initialize runtime and VM on worker startup
async function initializeWorker() {
  if (!isInitialized) {
    if (!quickJSRuntime) {
      quickJSRuntime = await getQuickJsRuntime(moduleManager);
    }
    vm = new durableVM({ runtime: quickJSRuntime });
    isInitialized = true;
  }
}

await initializeWorker();

self.addEventListener('message', async (event) => {
  const message = event.data as WorkerMessage;
  try {
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
      case WorkerMessageEnum.InitLiveModule: {
        const { code } =
          message.payload as WorkerPayload[WorkerMessageEnum.InitLiveModule];
        await initializeWorker();
        if (!vm) {
          throw new Error('Live VM not initialized');
        }
        vm.init(code);
        self.postMessage({
          id: message.id,
          type: message.type,
          status: WorkerMessageStatusEnum.Success,
        } as WorkerMessage);
        return;
      }
      case WorkerMessageEnum.RunFunctionOfLiveModule: {
        const { functionName, functionArgs } =
          message.payload as WorkerPayload[WorkerMessageEnum.RunFunctionOfLiveModule];
        const result = vm?.runFunction(functionName, functionArgs);
        self.postMessage({
          id: message.id,
          type: message.type,
          status: WorkerMessageStatusEnum.Success,
          payload: result,
        } as WorkerMessage);
        return;
      }
      case WorkerMessageEnum.GetValueOfLiveModule: {
        const { name } =
          message.payload as WorkerPayload[WorkerMessageEnum.GetValueOfLiveModule];
        const value = vm?.getValue(name);
        self.postMessage({
          id: message.id,
          type: message.type,
          status: WorkerMessageStatusEnum.Success,
          payload: value,
        } as WorkerMessage);
        return;
      }
      case WorkerMessageEnum.SetValueOfLiveModule: {
        const { name, value } =
          message.payload as WorkerPayload[WorkerMessageEnum.SetValueOfLiveModule];
        vm?.setValue(name, value);
        self.postMessage({
          id: message.id,
          type: message.type,
          status: WorkerMessageStatusEnum.Success,
        } as WorkerMessage);
        return;
      }
      case WorkerMessageEnum.DeleteLiveModule: {
        vm?.clean();
        vm = null;
        isInitialized = false;
        self.postMessage({
          id: message.id,
          type: message.type,
          status: WorkerMessageStatusEnum.Success,
        } as WorkerMessage);
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
  } catch (error) {
    self.postMessage({
      id: message.id,
      type: message.type,
      status: WorkerMessageStatusEnum.Error,
      payload: error instanceof Error ? error.message : 'Unknown error',
    } as WorkerMessage);
  }
});

self.addEventListener('close', async (event) => {});
