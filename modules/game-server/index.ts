import { createWebHandler } from 'utils';

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
