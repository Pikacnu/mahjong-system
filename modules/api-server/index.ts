import { createWebHandler } from 'utils';

Response.json(
  {
    message: 'Hello from API Server!',
  },
  {},
);

export const apiHandler = createWebHandler({
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
