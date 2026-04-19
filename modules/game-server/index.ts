import { createWebHandler } from 'utils';
import { createRunnerGateway, createStorageGateway } from './src/type';
import type { StorageGateway, RunnerGateway } from './src/type/gateway';

const storageGateway: StorageGateway = createStorageGateway(
  `localhost:${process.env.GRPC_PORT}`,
);
const runnerGateway: RunnerGateway = createRunnerGateway(
  `localhost:${process.env.GRPC_PORT}`,
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
