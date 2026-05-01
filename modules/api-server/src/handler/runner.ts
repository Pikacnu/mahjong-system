import { credentials } from '@grpc/grpc-js';
import { MahjongRunnerV1 } from 'proto';
import { GRPC_PORT, PLUGIN_RUNNER_HOSTNAME } from 'utils';

function createRunnerClient(
  address: string,
): MahjongRunnerV1.RunnerServiceClient {
  return new MahjongRunnerV1.RunnerServiceClient(
    address,
    credentials.createInsecure(),
  );
}

const RUNNER_SERVICE_ADDRESS = `${PLUGIN_RUNNER_HOSTNAME}:${GRPC_PORT}`;

export const runnerServiceClient = createRunnerClient(RUNNER_SERVICE_ADDRESS);
