import {
  createWebHandler,
  FUNCTION_STORAGE_HOSTNAME,
  PLUGIN_RUNNER_HOSTNAME,
} from 'utils';
import { createRunnerGateway, createStorageGateway } from './src/type';
import type { StorageGateway, RunnerGateway } from './src/classes/gateway';
import { GameInstanceManager } from './src/manager/gameInstanceManager';

const storageGateway: StorageGateway = createStorageGateway(
  `${FUNCTION_STORAGE_HOSTNAME}:${process.env.GRPC_PORT}`,
);
const runnerGateway: RunnerGateway = createRunnerGateway(
  `${PLUGIN_RUNNER_HOSTNAME}:${process.env.GRPC_PORT}`,
);

const gameInstanceManager = GameInstanceManager.getInstanceManager({
  runnerGateway,
  storageGateway,
});

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
