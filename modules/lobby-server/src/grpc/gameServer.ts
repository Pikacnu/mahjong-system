import { credentials } from '@grpc/grpc-js';
import { GAME_SERVER_HOSTNAME, GRPC_PORT } from 'utils';
import { MahjongCodeStorageV1, MahjongRoomV1, unaryCall } from 'proto';
import { ca } from 'zod/locales';
import { GameEvent } from 'proto/src/generated/services/room';

function createGameClient(address: string): MahjongRoomV1.RoomServicesClient {
  return new MahjongRoomV1.RoomServicesClient(
    address,
    credentials.createInsecure(),
  );
}

const GAME_SERVICE_ADDRESS = `${GAME_SERVER_HOSTNAME}:${GRPC_PORT}`;

export const gameServiceClient = createGameClient(GAME_SERVICE_ADDRESS);

export const gameServices = {
  createRoom: async (gameId: number): Promise<number> => {
    try {
      const createGameRespons = await unaryCall(
        gameServiceClient.createRoom.bind(gameServiceClient),
        { gameId },
      );
      return createGameRespons.gameId;
    } catch (err) {
      console.error('Error creating game room:', err);
      throw err;
    }
  },
  createGameChannel: async (
    gameId: number,
    publishFunction: (target: string, message: unknown) => void,
  ) => {
    const call = gameServiceClient.gameChannel();

    call.on('data', (response: MahjongRoomV1.ReactionMessage) => {
      const { event, payload, playerId, gameId } = response;
      let parsedPayload = undefined;
      try {
        parsedPayload = payload
          ? JSON.parse(Buffer.from(payload).toString())
          : undefined;
      } catch (error) {
        console.error('Error parsing payload from game channel:', error);
        return;
      }
      switch (event) {
        case GameEvent.RoundEnd:
        case GameEvent.RoundStart:
        case GameEvent.GameEnd:
        case GameEvent.GameStart:
          publishFunction(`game_${gameId}`, { event, payload: parsedPayload });
          break;
        case GameEvent.UNRECOGNIZED:
          break;
        default:
          publishFunction(`player_${playerId}`, {
            event,
            payload: parsedPayload,
          });
      }
    });
  },
};
