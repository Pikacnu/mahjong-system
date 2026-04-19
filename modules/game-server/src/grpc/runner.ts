import {
  MahjongCodeStorageV1,
  MahjongRunnerV1,
  createGrpcClient,
  unaryCall,
} from 'proto';
import { ResourceSource, decodeFromBytes, encodeToBytes } from 'utils';
import type { RunnerGateway, StorageGateway } from '../type/gateway';

function toStorageResourceSource(
  source?: ResourceSource,
): MahjongCodeStorageV1.ResourceSource | undefined {
  if (source === undefined) return undefined;
  switch (source) {
    case ResourceSource.BUILTIN:
      return MahjongCodeStorageV1.ResourceSource.BUILTIN;
    case ResourceSource.USER:
      return MahjongCodeStorageV1.ResourceSource.USER;
    default:
      return undefined;
  }
}

export function createRunnerGateway(address: string): RunnerGateway {
  const client = createGrpcClient(MahjongRunnerV1.RunnerServiceClient, address);

  return {
    async createLiveModule(payload) {
      const response = await unaryCall(client.createLiveModule.bind(client), {
        manifest: payload.manifest,
        isStateful: payload.isStateful,
      });
      return { moduleId: response.moduleId };
    },

    async callLiveModuleFn(payload) {
      const response = await unaryCall(client.callLiveModuleFn.bind(client), {
        moduleId: payload.moduleId,
        functionName: payload.functionName,
        payload: {
          this: encodeToBytes(payload.payload.this) as Buffer,
          args: payload.payload.args.map((arg) => encodeToBytes(arg) as Buffer),
        },
      });
      return decodeFromBytes(response.result);
    },

    async removeLiveModule(payload) {
      await unaryCall(client.removeLiveModule.bind(client), {
        moduleId: payload.moduleId,
      });
    },

    async setLiveModuleValue(payload) {
      await unaryCall(client.setLiveModuleValue.bind(client), {
        moduleId: payload.moduleId,
        key: payload.key,
        value: encodeToBytes(payload.value) as Buffer,
      });
    },
  };
}

export function createStorageGateway(address: string): StorageGateway {
  const client = createGrpcClient(
    MahjongCodeStorageV1.StorageServiceClient,
    address,
  );

  return {
    async getPluginDefinition(payload) {
      const response = await unaryCall(
        client.getPluginDefinition.bind(client),
        {
          methodInfo: payload.methodInfo,
          resourceSource: toStorageResourceSource(payload.resourceSource),
        },
      );

      return {
        isStateful: response.isStateful,
        defaultStore: decodeFromBytes(response.defaultStore),
        dependencies: response.dependencies,
      };
    },
  };
}
