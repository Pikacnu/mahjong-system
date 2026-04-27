import { credentials } from '@grpc/grpc-js';
import { GRPC_PORT, FUNCTION_STORAGE_HOSTNAME } from 'utils';
import { MahjongCodeStorageV1 } from 'proto';

function createStorageClient(
  address: string,
): MahjongCodeStorageV1.StorageServiceClient {
  return new MahjongCodeStorageV1.StorageServiceClient(
    address,
    credentials.createInsecure(),
  );
}

const STORAGE_SERVICE_ADDRESS = `${FUNCTION_STORAGE_HOSTNAME}:${GRPC_PORT}`;

export const storageServiceClient = createStorageClient(
  STORAGE_SERVICE_ADDRESS,
);
