import { MahjongRunnerV1, unaryCall } from 'proto';
import {
  FunctionResponse,
  RunnerServiceClient,
} from 'proto/src/generated/services/runner';
import { credentials } from '@grpc/grpc-js';
import { encodeToBytes } from 'utils/src/utils';

export async function createRunnerServices(address: string) {
  const runnerServicesClient = new MahjongRunnerV1.RunnerServiceClient(
    `localhost:${process.env.GRPC_PORT}`,
    credentials.createInsecure(),
  );
  return runnerServicesClient;
}

export async function callLiveModuleFunction(
  client: RunnerServiceClient,
  payload: {
    this: unknown;
    args: unknown[];
  },
  functionInfo: {
    moduleId: string;
    functionName: string;
  },
): Promise<unknown> {
  const resultArg = (await unaryCall(client.callLiveModuleFn, {
    moduleId: functionInfo.moduleId,
    payload: {
      this: encodeToBytes(payload.this),
      args: encodeToBytes(payload.args),
    },
    functionName: functionInfo.functionName,
  } as MahjongRunnerV1.LiveModuleRunRequest)) as FunctionResponse;
  const resultData = (
    Buffer.isBuffer(resultArg.result)
      ? resultArg
      : Buffer.from(resultArg.result)
  ) as Buffer;
  const resultObj = resultData.toString('utf-8');
  try {
    return JSON.parse(resultObj);
  } catch {
    return resultObj;
  }
}
