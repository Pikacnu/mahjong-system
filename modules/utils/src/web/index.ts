import { serve, type Serve } from 'bun';
import { HOSTNAME, PORT } from '../config';

export function createWebHandler<T extends unknown, T2 extends string>(
  config: Serve.Options<T, T2>,
): ReturnType<typeof serve<T>> {
  const server = serve<T>({
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
  } as Serve.Options<T, T2>);

  return server;
}
