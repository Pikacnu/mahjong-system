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
      this: payload.this,
      args: payload.args,
    },
    functionName: functionInfo.functionName,
  })) as FunctionResponse;

  if (!resultArg.success) {
    throw new Error(resultArg.error?.message || 'Unknown error');
  }

  return resultArg.data;
}
