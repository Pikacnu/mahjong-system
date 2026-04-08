import { PORT } from 'utils';
import { WorkerManager } from './src/manager/normal_runner_manager';
// import type { VMOptions } from './src/utils/type';
import {
  MAX_TASKS_PER_WORKER,
  MAX_WORKERS,
  TASK_TIMEOUT_MS,
} from './src/utils/config';
import { CodeCacher } from './src/utils/cacher';
// import { ModuleManager } from './src/utils/moduleManager';
// import {
//   APIKeyMiddleware,
//   ContentTypeMiddleware,
//   CORSHeadersMiddleware,
//   createMiddlewarePipeline,
// } from './src/utils/middleware';

import { ServerCredentials } from '@grpc/grpc-js';
import { createFunctionRunnerGRPCHandler } from './src/grpc/handler';

const normalRunnerManager = new WorkerManager({
  MaxWorkers: MAX_WORKERS,
  MinWorkers: MAX_WORKERS,
  MaxTasksPerWorker: MAX_TASKS_PER_WORKER,
  TaskTimeoutMs: TASK_TIMEOUT_MS,
});

const codeCacher = new CodeCacher({
  MaxEntrys: 40,
  CacheTimeoutMin: 128,
});

const grpcServer = createFunctionRunnerGRPCHandler({
  normalRunnerManager,
  runCodeCacher: codeCacher,
});

grpcServer.bind(`${PORT}`, ServerCredentials.createInsecure());

//const moduleManager = ModuleManager.getInstance();

// const apiMiddlewarePipeline = createMiddlewarePipeline([
//   APIKeyMiddleware,
//   ContentTypeMiddleware,
//   CORSHeadersMiddleware,
// ]);
// const server = createWebHandler({
//   reusePort: true,
//   routes: {
//     '/run': {
//       POST: apiMiddlewarePipeline(async (req) => {
//         try {
//           const responseData = (await req.json()) as {
//             functionName: string;
//             functionArgs: {
//               this: any;
//               args: any[];
//             };
//           };
//           const entryFunctionName = ''; //placeholder
//           const executeType = ''; //placeholder
//           // get function info
//           const functionInfo = {};
//           moduleManager.setVersion(0); // placeholder
//           // get modules
//           const deps: {
//             name: string;
//             version: number;
//           }[] = [];
//           deps.forEach((dep) => {
//             const moduleData = moduleManager.getModule(dep.name);
//             if (!moduleData) {
//               const moduleInfo = {
//                 code: '', // placeholder
//               }; // placeholder
//               moduleManager.addModule({
//                 name: dep.name,
//                 code: moduleInfo.code,
//                 version: dep.version,
//                 hash: BigInt(0), // placeholder
//               });
//             }
//           });
//           let code = codeCacher.getCode(responseData.functionName);
//           if (!code) {
//             // get code
//             code = '';
//           }
//           const payload = {
//             ...responseData,
//             code,
//             options: {
//               entryFunctionName,
//               executeType,
//             },
//           };
//           const result = await manager.execute(payload);
//           return Response.json({ result });
//         } catch (error) {
//           return Response.json(
//             { error: error instanceof Error ? error.message : String(error) },
//             { status: 500 },
//           );
//         }
//       }),
//     },
//     '/function': {
//       GET: async (req) => {
//         const url = new URL(req.url);
//         const functionName = url.searchParams.get('name');
//         if (!functionName) {
//           return Response.json({
//             functions: codeCacher.getAllFunctionNames(),
//           });
//         }
//         const code = codeCacher.getCode(functionName);
//         if (!code) {
//           return Response.json(
//             { error: 'Function not found' },
//             {
//               status: 404,
//               headers: {
//                 'Content-Type': 'application/json',
//               },
//             },
//           );
//         }
//         return Response.json(
//           { code },
//           { status: 200, headers: { 'Content-Type': 'application/json' } },
//         );
//       },
//       POST: apiMiddlewarePipeline(async (req) => {
//         try {
//           const { functionName, code } = (await req.json()) as {
//             functionName: string;
//             code: string;
//           };
//           if (!functionName || !code) {
//             return Response.json(
//               { error: 'functionName and code are required' },
//               { status: 400 },
//             );
//           }
//           codeCacher.setCode(functionName, code);
//           return Response.json({ message: 'Function code updated' });
//         } catch (error) {
//           return Response.json(
//             { error: error instanceof Error ? error.message : String(error) },
//             { status: 400 },
//           );
//         }
//       }),
//     },
//     '/health': {
//       GET: async () => {
//         return Response.json({ status: 'ok' });
//       },
//     },
//   },
// });

// console.log(`Server running at http://${server.hostname}:${server.port}/`);

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  // server.stop();
  grpcServer.forceShutdown();
  normalRunnerManager.destroy();
  process.exit();
});
