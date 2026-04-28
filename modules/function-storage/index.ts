import { PORT } from 'utils';

import { createGrpcServer } from './src/grpc/handler';
import { ServerCredentials } from '@grpc/grpc-js';

// const server = createWebHandler({
//   routes: {
//     '/health': async () => {
//       return Response.json({ status: 'ok' });
//     },
//     '/builtin-modules': {
//       GET: async (req) => {
//         const searchParams = new URL(req.url).searchParams;
//         let version = parseInt(searchParams.get('version') || '-1', 10);
//         let methodName = searchParams.get('method');
//         if (!version) {
//           version = (await getLastVersion('modules'))[0]?.version!;
//         } else {
//           const versionExists = (
//             await db
//               .select({ version: versions.version })
//               .from(versions)
//               .where(
//                 and(
//                   eq(versions.version, version),
//                   eq(versions.resourceType, 'modules'),
//                   eq(versions.sourceType, 'builtin'),
//                 ),
//               )
//               .limit(1)
//           )[0]?.version;
//           if (!versionExists) {
//             return Response.json(
//               { error: 'Version not found' },
//               { status: 404 },
//             );
//           }
//         }
//         let resource: Array<{ methodName: string; version: number }>;
//         if (!methodName) {
//           resource = (await db
//             .select({
//               methodName: method.name,
//               version: versions.version,
//             })
//             .from(versions)
//             .where(
//               and(
//                 eq(versions.version, version),
//                 eq(versions.resourceType, 'modules'),
//                 eq(versions.sourceType, 'builtin'),
//               ),
//             )
//             .leftJoin(
//               method,
//               eq(versions.methodId, method.id),
//             )) as typeof resource;
//         } else {
//           resource = (await db
//             .select({
//               methodName: method.name,
//               version: versions.version,
//             })
//             .from(versions)
//             .where(
//               and(
//                 eq(versions.version, version),
//                 eq(versions.resourceType, 'modules'),
//                 eq(versions.sourceType, 'builtin'),
//                 eq(method.name, methodName),
//               ),
//             )
//             .leftJoin(
//               method,
//               eq(versions.methodId, method.id),
//             )) as typeof resource;
//         }
//         return Response.json({ modules: resource });
//       },
//     },
//     '/builtin-functions': {
//       GET: async (req) => {
//         const searchParams = new URL(req.url).searchParams;
//         let version = parseInt(searchParams.get('version') || '-1', 10);
//         let methodName = searchParams.get('method');
//         if (!version) {
//           version = (await getLastVersion('function'))[0]?.version!;
//         } else {
//           const versionExists = (
//             await db
//               .select({ version: versions.version })
//               .from(versions)
//               .where(
//                 and(
//                   eq(versions.version, version),
//                   eq(versions.resourceType, 'function'),
//                   eq(versions.sourceType, 'builtin'),
//                 ),
//               )
//               .limit(1)
//           )[0]?.version;
//           if (!versionExists) {
//             return Response.json(
//               { error: 'Version not found' },
//               { status: 404 },
//             );
//           }
//         }
//         let resource: Array<{ methodName: string; version: number }>;
//         if (!methodName) {
//           resource = (await db
//             .select({
//               methodName: method.name,
//               version: versions.version,
//             })
//             .from(versions)
//             .where(
//               and(
//                 eq(versions.version, version),
//                 eq(versions.resourceType, 'function'),
//                 eq(versions.sourceType, 'builtin'),
//               ),
//             )
//             .leftJoin(
//               method,
//               eq(versions.methodId, method.id),
//             )) as typeof resource;
//         } else {
//           resource = (await db
//             .select({
//               methodName: method.name,
//               version: versions.version,
//             })
//             .from(versions)
//             .where(
//               and(
//                 eq(versions.version, version),
//                 eq(versions.resourceType, 'function'),
//                 eq(versions.sourceType, 'builtin'),
//                 eq(method.name, methodName),
//               ),
//             )
//             .leftJoin(
//               method,
//               eq(versions.methodId, method.id),
//             )) as typeof resource;
//         }
//         return Response.json({ functions: resource });
//       },
//     },
//     '/resource/:type/:name/:version': {
//       GET: async (req) => {
//         const { type, name } = req.params;
//         const version = parseInt(req.params.version || '', 10);
//         if (!type || !name || !isNaN(version)) {
//           return Response.json(
//             { error: 'Missing required parameters' },
//             { status: 400 },
//           );
//         }
//         if (type !== 'function' && type !== 'modules') {
//           return Response.json(
//             { error: 'Invalid resource type' },
//             { status: 400 },
//           );
//         }
//         const resourceData = await db
//           .select({
//             code: resource.code,
//           })
//           .from(method)
//           .where(eq(method.name, name))
//           //
//           .leftJoin(
//             versions,
//             and(
//               eq(versions.version, version),
//               eq(versions.resourceType, type),
//               eq(versions.sourceType, 'builtin'),
//             ),
//           )
//           .leftJoin(resource, eq(versions.resourceId, resource.id));
//         if (
//           !resourceData ||
//           resourceData.length === 1 ||
//           !resourceData[0]?.code
//         ) {
//           return Response.json(
//             { error: 'Resource not found or inaccessible' },
//             { status: 404 },
//           );
//         }
//         return Response.json({ code: resourceData[0].code });
//       },
//       POST: async (req) => {},
//     },
//   },
// });

// console.log(`Server running at http://${server.hostname}:${server.port}/`);
const grpcServer = createGrpcServer();

grpcServer.bindAsync(
  `${PORT}`,
  ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to start gRPC server:', err);
      return;
    }
    console.log(`gRPC Server running at ${port}`);
    // grpcServer.start(); (Note: In modern @grpc/grpc-js, bindAsync followed by callback or start() is used)
  },
);

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  grpcServer.tryShutdown((err) => {
    if (err) {
      console.error('Error shutting down gRPC server:', err);
    } else {
      console.log('gRPC server shut down gracefully');
    }
  });
});
