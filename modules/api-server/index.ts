import { createWebHandler } from 'utils';
import { gameManagerHandler } from './src/endpoints/gameManager';
import { pluginHandler } from './src/endpoints/pluginManager';
import { pluginResourceHandler } from './src/endpoints/pluginResource';
import { runnerHandler } from './src/endpoints/runner';
import { roomManagerHandler } from '@/endpoints/roomManager';
import { playerManagerHandler } from '@/endpoints/playerManager';
import { runMigrate } from './db/migrater';
import { renderDashboardPage } from './src/ui/dashboard';
import { renderApiDocsPage } from './src/ui/docs';

await runMigrate();

export const apiHandler = createWebHandler({
  routes: {
    '/api/game/management': gameManagerHandler,
    '/api/plugin/management': pluginHandler,
    '/api/plugin/resource': pluginResourceHandler,
    '/api/runner/execute': runnerHandler,
    '/api/room/management': roomManagerHandler,
    '/api/player/management': playerManagerHandler,
  },
  fetch(req, server) {
    const pathname = new URL(req.url).pathname;
    const searchParams = new URL(req.url).searchParams;

    if (pathname === '/' || pathname === '/index.html') {
      return new Response(renderDashboardPage(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (pathname === '/docs' || pathname === '/api-docs') {
      return new Response(renderApiDocsPage(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (pathname === '/health') {
      return Response.json({ status: 'ok' }, { status: 200 });
    }

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
