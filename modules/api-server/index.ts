import { createWebHandler } from 'utils';
import { pluginHandler } from './src/endpoints/pluginManager';
import { pluginResourceHandler } from './src/endpoints/pluginResource';
import { roomManagerHandler } from '@/endpoints/roomManager';
import { playerManagerHandler } from '@/endpoints/playerManager';

Response.json(
  {
    message: 'Hello from API Server!',
  },
  {},
);

export const apiHandler = createWebHandler({
  routes: {
    '/api/plugin/management': pluginHandler,
    '/api/plugin/resource': pluginResourceHandler,
    '/api/room/management': roomManagerHandler,
    '/api/player/management': playerManagerHandler,
  },
  fetch(req, server) {
    const pathname = new URL(req.url).pathname;
    const searchParams = new URL(req.url).searchParams;

    return Response.json(
      {
        message: '404 Not Found',
      },
      {
        status: 404,
        statusText: 'Not Found',
      },
    );
  },
});
