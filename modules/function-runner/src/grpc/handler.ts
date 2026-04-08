import { Metadata, Server } from '@grpc/grpc-js';
import { Status } from '@grpc/grpc-js/build/src/constants';
import { MahjongRunnerV1, MahjongCodeStorageV1, unaryCall } from 'proto';
import { ErrorCode } from 'proto/src/generated/common';
import { storageServiceClient } from './storage-client';
import { ModuleManager } from '../manager/moduleManager';
import { WorkerManager } from '../manager/normal_runner_manager';
import type { RunTaskPayload, VMOptions } from '../utils/type';
import type { CodeCacher } from '../utils/cacher';

const moduleManager = ModuleManager.getInstance();

export function createFunctionRunnerGRPCHandler({
  normalRunnerManager,
  defaultVMOptions,
  runCodeCacher,
}: {
  normalRunnerManager: WorkerManager;
  defaultVMOptions?: Partial<VMOptions>;
  runCodeCacher: CodeCacher;
}): Server {
  const server = new Server();
  server.addService(MahjongRunnerV1.RunnerServiceService, {
    runFunction: async (call, callback) => {
      const { functionInfo, payload } = call.request;
      if (!functionInfo || !payload) {
        const errorMetadata = new Metadata();
        errorMetadata.set('error-code', ErrorCode.INVALID_ARGUMENT.toString());
        return callback(
          {
            code: Status.INVALID_ARGUMENT,
            details: 'Missing functionInfo or payload in request',
            metadata: errorMetadata,
          },
          null,
        );
      }
      try {
        // get function dependencies list
        const dependenciesResponse = await unaryCall(
          storageServiceClient.getMethodInfo.bind(storageServiceClient),
          {
            methodInfo: functionInfo,
          } as MahjongCodeStorageV1.GetMethodInfoRequest,
        );

        const dependencies = dependenciesResponse.dependencies || [];
        const notCachedDependencies = dependencies.filter(
          (dep) => !moduleManager.getModule(dep.name),
        );
        if (notCachedDependencies.length > 0) {
          // fetch all dependencies code and add to module manager
          const notCachedDependenciesResults = await Promise.allSettled(
            notCachedDependencies.map(async (dep) => {
              const dependencyCode = await unaryCall(
                storageServiceClient.getResourcesData.bind(
                  storageServiceClient,
                ),
                {
                  methodInfo: dep,
                } as MahjongCodeStorageV1.GetResourceDataRequest,
              );
              const bigint = Buffer.from(dependencyCode.hash).readBigInt64BE();
              return {
                ...dep,
                code: dependencyCode.code,
                hash: bigint,
              };
            }),
          );

          notCachedDependenciesResults
            .filter(
              (
                res,
              ): res is PromiseFulfilledResult<{
                name: string;
                version: number;
                code: string;
                hash: bigint;
              }> => res.status === 'fulfilled' && !!res.value.code,
            )
            .forEach((result) => {
              moduleManager.addModule({
                name: result.value.name,
                version: result.value.version,
                code: result.value.code,
                hash: result.value.hash,
              });
            });
          if (
            notCachedDependenciesResults.some(
              (res) => res.status === 'rejected',
            )
          ) {
            console.warn(
              'Some dependencies failed to fetch:',
              notCachedDependenciesResults.filter(
                (res): res is PromiseRejectedResult =>
                  res.status === 'rejected',
              ),
            );
            return callback(
              {
                code: Status.INTERNAL,
                details: 'Failed to fetch some dependencies',
              },
              null,
            );
          }
        }
        // get main function code
        let functionCode: string;
        const cachedCode = runCodeCacher.getCode(functionInfo);
        if (!cachedCode) {
          const functionCodeResponse = await unaryCall(
            storageServiceClient.getResourcesData.bind(storageServiceClient),
            {
              methodInfo: functionInfo,
            } as MahjongCodeStorageV1.GetResourceDataRequest,
          );
          if (!functionCodeResponse.code) {
            return callback(
              {
                code: Status.INTERNAL,
                details: 'Failed to fetch function code',
              },
              null,
            );
          }
          functionCode = functionCodeResponse.code;
          runCodeCacher.setCode(functionInfo, functionCode);
        } else {
          functionCode = cachedCode;
        }
        if (!functionCode) {
          return callback(
            {
              code: Status.INTERNAL,
              details: 'Function code is empty',
            },
            null,
          );
        }
        const executeFunctionPayload: RunTaskPayload = {
          functionArgs: {
            this: payload?.this || null,
            args: payload?.args || [],
          },
          code: functionCode,
          options: defaultVMOptions,
          dependencies,
        };
        const result = await normalRunnerManager.execute(
          executeFunctionPayload,
        );
        callback(null, { result });
      } catch (err) {
        console.error('gRPC Error:', err);
        callback(
          {
            code: Status.INTERNAL,
            details: 'Failed to call storage service',
          },
          null,
        );
      }
    },
    createLiveModule: async (call, callback) => {},
    runLiveModule: async (call, callback) => {},
    removeLiveModule: async (call, callback) => {},
    runYukuCheck: async (call, callback) => {},
  } as MahjongRunnerV1.RunnerServiceServer);
  return server;
}
