import {
  MahjongCodeStorageV1,
  MahjongRunnerV1,
  createGrpcClient,
  unaryCall,
} from 'proto';
import { ResourceSource } from 'utils';
import type { RunnerGateway, StorageGateway } from '../plugins/plugin-manager';

function encodeUnknown(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(JSON.stringify(value ?? null), 'utf-8');
}

function decodeUnknown(value: Buffer): unknown {
  if (!value || value.length === 0) return null;
  const text = value.toString('utf-8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

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
          this: encodeUnknown(payload.payload.this),
          args: payload.payload.args.map((arg) => encodeUnknown(arg)),
        },
      });
      return decodeUnknown(response.result);
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
        value: encodeUnknown(payload.value),
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
        defaultStore: decodeUnknown(response.defaultStore),
        dependencies: response.dependencies,
      };
    },
  };
}
