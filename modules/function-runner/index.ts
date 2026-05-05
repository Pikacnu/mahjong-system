import { PORT } from 'utils';
import { WorkerManager } from './src/manager/workerManager';
import {
  MAX_TASKS_PER_WORKER,
  MAX_WORKERS,
  TASK_TIMEOUT_MS,
} from './src/utils/config';
import { CodeCacher } from './src/utils/cacher';
import { ServerCredentials } from '@grpc/grpc-js';
import { createFunctionRunnerGRPCHandler } from './src/grpc/handler';

const normalRunnerManager = new WorkerManager({
  MaxWorkers: MAX_WORKERS,
  MinWorkers: MAX_WORKERS,
  MaxTasksPerWorker: MAX_TASKS_PER_WORKER,
  TaskTimeoutMs: TASK_TIMEOUT_MS,
});

const codeCacher = new CodeCacher({
  MaxEntrys: 40,
  CacheTimeoutMin: 128,
});

const grpcServer = createFunctionRunnerGRPCHandler({
  normalRunnerManager,
  runCodeCacher: codeCacher,
});

grpcServer.bindAsync(
  `0.0.0.0:${PORT}`,
  ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to bind gRPC server:', err);
      return;
    }
    console.log(`gRPC server running at http://0.0.0.0:${port}`);
  },
);

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  // server.stop();
  grpcServer.forceShutdown();
  normalRunnerManager.destroy();
  process.exit();
});
