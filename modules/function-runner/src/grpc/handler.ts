import { Metadata, Server } from '@grpc/grpc-js';
import { Status } from '@grpc/grpc-js/build/src/constants';
import {
  MahjongRunnerV1,
  MahjongCodeStorageV1,
  MahjongCommonV1,
  unaryCall,
} from 'proto';
import { ErrorCode } from 'proto/src/generated/common';
import { storageServiceClient } from './storage-client';
import { ModuleManager } from '../utils/moduleManager';

const moduleManager = ModuleManager.getInstance();

function createGrpcServer(handlers: any): Server {
  const server = new Server();
  server.addService(MahjongRunnerV1.RunnerServiceService, {
    runFunction: async (call, callback) => {
      const { functionInfo, payload } = call.request;
      if (!functionInfo || !payload) {
        const errorMetadata = new Metadata();
        errorMetadata.set('error-code', ErrorCode.INVALID_ARGUMENT.toString());
        callback(
          {
            code: Status.INVALID_ARGUMENT,
            details: 'Missing functionInfo or payload in request',
            metadata: errorMetadata,
          },
          null,
        );
      }
      try {
        const dependenciesResponse = await unaryCall(
          storageServiceClient.getMethodInfo.bind(storageServiceClient),
          {
            methodInfo: functionInfo,
          } as MahjongCodeStorageV1.GetMethodInfoRequest,
        );
        const dependencies = dependenciesResponse.dependencies || [];

        if (dependencies.length > 0) {
          const fullDependencies = await Promise.allSettled(
            dependencies.map(async (dep) => {
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
          fullDependencies
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
        }
        const result = await handlers.runFunction(functionInfo, payload);
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
    runYukuCheck: async (call, callback) => {},
  } as MahjongRunnerV1.RunnerServiceServer);
  return server;
}
