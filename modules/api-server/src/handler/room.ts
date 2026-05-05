import { credentials } from '@grpc/grpc-js';
import { MahjongRoomV1 } from 'proto';
import { GAME_SERVER_HOSTNAME, GRPC_PORT, PLUGIN_RUNNER_HOSTNAME } from 'utils';

function createGameClient(address: string): MahjongRoomV1.RoomServicesClient {
  return new MahjongRoomV1.RoomServicesClient(
    address,
    credentials.createInsecure(),
  );
}

const GAME_SERVICE_ADDRESS = `${GAME_SERVER_HOSTNAME}:${GRPC_PORT}`;

export const gameServiceClient = createGameClient(GAME_SERVICE_ADDRESS);
