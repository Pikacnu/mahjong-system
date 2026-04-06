import { serve } from 'bun';
import { HOSTNAME, PORT } from '../config';

type ServeFunctionConfig = Parameters<typeof serve>[0];

export function createWebHandler(
  config: Partial<ServeFunctionConfig>,
): ReturnType<typeof serve> {
  const server = serve({
    ...config,
    port: PORT,
    hostname: HOSTNAME,
    async fetch(req, server) {
      let res: Response | undefined | void;
      if (config.fetch) {
        const fn = config.fetch;
        res = await fn.bind(this)(req, server);
      }
      if (!res || res.status === 404)
        res = Response.json(
          {
            error: '404 Not Found',
          },
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      return res;
    },
  } as ServeFunctionConfig);

  return server;
}
