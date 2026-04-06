export const APIKeyMiddleware = (
  handler: (req: Request) => Promise<Response>,
) => {
  return async (req: Request) => {
    if (
      process.env.API_KEY &&
      req.headers.get('x-api-key') !== process.env.API_KEY
    ) {
      return Response.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }
    return handler(req);
  };
};

export const ContentTypeMiddleware = (
  handler: (req: Request) => Promise<Response>,
) => {
  return async (req: Request) => {
    if (!req.headers.get('Content-Type')?.includes('application/json')) {
      return Response.json(
        { error: 'Unsupported Media Type' },
        {
          status: 415,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }
    return handler(req);
  };
};

export const CORSHeadersMiddleware = (
  handler: (req: Request) => Promise<Response>,
) => {
  return async (req: Request) => {
    const res = await handler(req);
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    return res;
  };
};

export const createMiddlewarePipeline = (
  middlewares: Array<typeof APIKeyMiddleware>,
) => {
  return (handler: (req: Request) => Promise<Response>) => {
    if (middlewares.length === 0) return handler;
    return middlewares.reduceRight((prev, curr) => curr(prev), handler);
  };
};
