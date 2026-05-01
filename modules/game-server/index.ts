import { ServerCredentials } from '@grpc/grpc-js';
import {
  createWebHandler,
  FUNCTION_STORAGE_HOSTNAME,
  GRPC_PORT,
  PLUGIN_RUNNER_HOSTNAME,
} from 'utils';
import { createRunnerGateway, createStorageGateway } from './src/type';
import type { StorageGateway, RunnerGateway } from './src/classes/gateway';
import { GameInstanceManager } from './src/manager/gameInstanceManager';
import { createGrpcServer } from './src/grpc/handler';

const storageGateway: StorageGateway = createStorageGateway(
  `${FUNCTION_STORAGE_HOSTNAME}:${GRPC_PORT}`,
);
const runnerGateway: RunnerGateway = createRunnerGateway(
  `${PLUGIN_RUNNER_HOSTNAME}:${GRPC_PORT}`,
);

const gameInstanceManager = GameInstanceManager.getInstanceManager({
  runnerGateway,
  storageGateway,
});

const grpcServer = createGrpcServer(gameInstanceManager);
grpcServer.bindAsync(
  `0.0.0.0:${GRPC_PORT}`,
  ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to bind gRPC server:', err);
      return;
    }
    console.log(`gRPC server running at http://0.0.0.0:${port}`);
  },
);

export const gameServerHandler = createWebHandler({
  fetch(req, server) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api')) {
      //return server.fetch(req);
    }
  },
  websocket: {
    open(ws) {},
    close(ws, code, reason) {},
    message(ws, message) {},
  },
});
