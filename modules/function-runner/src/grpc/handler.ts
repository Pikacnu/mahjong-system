import { Metadata, Server } from '@grpc/grpc-js';
import { Status } from '@grpc/grpc-js/build/src/constants';
import { MahjongRunnerV1, MahjongCodeStorageV1, unaryCall } from 'proto';
import { ErrorCode } from 'proto/src/generated/common';
import { storageServiceClient } from './storage-client';
import { WorkerManager } from '../manager/normal_runner_manager';
import type { RunTaskPayload, VMOptions } from '../utils/type';
import type { CodeCacher } from '../utils/cacher';
import { LiveModuleManager } from '../manager/live_code_manager';

const liveModuleManager = LiveModuleManager.getInstance();

export function createFunctionRunnerGRPCHandler({
  normalRunnerManager,
  defaultVMOptions,
  runCodeCacher,
}: {
  normalRunnerManager: WorkerManager;
  defaultVMOptions?: Partial<VMOptions>;
  runCodeCacher: CodeCacher;
}): Server {
  const fetchDependencies = async (methodInfo: unknown) => {
    const response = await unaryCall(
      storageServiceClient.getMethodInfo.bind(storageServiceClient),
      {
        methodInfo,
      } as MahjongCodeStorageV1.GetMethodInfoRequest,
    );
    return response.dependencies || [];
  };

  const fetchPluginDefinition = async (
    methodInfo: MahjongCodeStorageV1.MethodInfo,
  ) => {
    const response = await unaryCall(
      storageServiceClient.getPluginDefinition.bind(storageServiceClient),
      {
        methodInfo,
        resourceSource: MahjongCodeStorageV1.ResourceSource.USER,
      } as MahjongCodeStorageV1.GetPluginDefinitionRequest,
    );

    let defaultStore: unknown = {};
    try {
      defaultStore = JSON.parse(
        Buffer.from(response.defaultStore).toString('utf-8'),
      );
    } catch {
      defaultStore = {};
    }

    return {
      isStateful: response.isStateful,
      defaultStore,
      dependencies: response.dependencies || [],
    };
  };

  const fetchResourceCode = async (methodInfo: unknown) => {
    const response = await unaryCall(
      storageServiceClient.getResourcesData.bind(storageServiceClient),
      {
        methodInfo,
      } as MahjongCodeStorageV1.GetResourceDataRequest,
    );
    return response.code;
  };

  const resolveFunctionCode = async (functionInfo: unknown) => {
    const cachedCode = runCodeCacher.getCode(functionInfo as any);
    if (cachedCode) {
      return cachedCode;
    }

    const fetchedCode = await fetchResourceCode(functionInfo);
    if (!fetchedCode) {
      throw new Error('Failed to fetch function code');
    }

    runCodeCacher.setCode(functionInfo as any, fetchedCode);
    return fetchedCode;
  };

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
        const dependencies = await fetchDependencies(functionInfo);

        const functionCode = await resolveFunctionCode(functionInfo);
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
    createLiveModule: async (call, callback) => {
      const { manifest, isStateful } = call.request;
      if (!manifest) {
        return callback(
          {
            code: Status.INVALID_ARGUMENT,
            details: 'Missing manifest in request',
          },
          null,
        );
      }

      let dependencies: MahjongCodeStorageV1.MethodInfo[] = [];
      let resolvedIsStateful = isStateful ?? false;
      let defaultState: unknown = {};

      try {
        const definition = await fetchPluginDefinition(manifest);
        dependencies = definition.dependencies;
        resolvedIsStateful = definition.isStateful;
        defaultState = definition.defaultStore;
      } catch {
        dependencies = await fetchDependencies(manifest);
      }

      const reosurceCodeInfo = await unaryCall(
        storageServiceClient.getResourcesData.bind(storageServiceClient),
        {
          methodInfo: manifest,
        } as MahjongCodeStorageV1.GetResourceDataRequest,
      );
      if (!reosurceCodeInfo.code) {
        return callback(
          {
            code: Status.INTERNAL,
            details: 'Failed to fetch live module code',
          },
          null,
        );
      }
      try {
        const liveManifest = resolvedIsStateful
          ? {
              ...manifest,
              dependencies,
              isStateful: true as const,
              defaultState,
            }
          : {
              ...manifest,
              dependencies,
              isStateful: false as const,
            };

        const liveModuleId = await liveModuleManager.addLiveModule({
          code: reosurceCodeInfo.code,
          ...liveManifest,
        });
        callback(null, { moduleId: liveModuleId });
      } catch (err) {
        console.error('gRPC Error:', err);
        callback(
          {
            code: Status.INTERNAL,
            details: 'Failed to create live module',
          },
          null,
        );
      }
    },
    callLiveModuleFn: async (call, callback) => {},
    removeLiveModule: async (call, callback) => {},
    runYukuCheck: async (call, callback) => {},
    setLiveModuleValue: async (call, callback) => {},
    getLiveModuleValue: async (call, callback) => {},
  } as MahjongRunnerV1.RunnerServiceServer);
  return server;
}
