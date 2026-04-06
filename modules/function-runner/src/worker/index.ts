import type { QuickJSRuntime } from 'quickjs-emscripten';
import {
  WorkerMessageEnum,
  WorkerMessageStatusEnum,
  type RunTaskPayload,
  type WorkerMessage,
  type VMFunctionArgs,
  type VMOptions,
} from '../utils/type';
import { getQuickJsRuntime, VM } from '../utils/vm';

declare const self: Worker;

let isInitialized = false;

let quickJSRuntime: QuickJSRuntime | null = null;
let vm: VM | null = null;

// Initialize runtime and VM on worker startup
async function initializeWorker() {
  if (!isInitialized) {
    quickJSRuntime = await getQuickJsRuntime();
    vm = new VM({ runtime: quickJSRuntime });
    isInitialized = true;
  }
}

await initializeWorker();

self.addEventListener('message', async (event) => {
  const { id, type, payload } = event.data as WorkerMessage;
  switch (type) {
    case WorkerMessageEnum.RunTask: {
      if (!isInitialized) {
        self.postMessage({
          id,
          type: WorkerMessageEnum.RunTask,
          status: WorkerMessageStatusEnum.Error,
          payload: 'Worker not initialized',
        } as WorkerMessage);
        return;
      }
      try {
        const { code, options, functionArgs } = payload as RunTaskPayload;
        const result = vm!.runCode(
          code,
          options as VMOptions,
          functionArgs as VMFunctionArgs,
        );
        self.postMessage({
          id,
          type: WorkerMessageEnum.RunTask,
          status: WorkerMessageStatusEnum.Success,
          payload: result,
        } as WorkerMessage);
      } catch (error) {
        self.postMessage({
          id,
          type: WorkerMessageEnum.RunTask,
          status: WorkerMessageStatusEnum.Error,
          payload: error instanceof Error ? error.message : 'Unknown error',
        } as WorkerMessage);
      }
      break;
    }
    default:
      self.postMessage({
        id,
        type,
        status: WorkerMessageStatusEnum.Error,
        payload: `Unknown message type: ${type}`,
      } as WorkerMessage);
  }
});

self.addEventListener('close', async (event) => {});
