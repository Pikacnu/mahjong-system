import { credentials } from '@grpc/grpc-js';
import { GAME_SERVER_HOSTNAME, GRPC_PORT } from 'utils';
import { MahjongCodeStorageV1, MahjongRoomV1, unaryCall } from 'proto';
import { Event } from 'proto/src/generated/services/room';

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
      const createGameResponse = await unaryCall(
        gameServiceClient.createRoom.bind(gameServiceClient),
        { gameId },
      );
      if (
        !createGameResponse.success ||
        createGameResponse.gameId === undefined ||
        createGameResponse.gameId === null
      ) {
        throw new Error(
          'Failed to create game room: Invalid response from server',
        );
      }
      return createGameResponse.gameId;
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

    call.write({
      gameId,
      event: Event.CONNECTION_ESTABLISH,
      payload: Buffer.from(new Uint8Array()),
    });

    call.on('data', (response: MahjongRoomV1.ReactionMessage) => {
      const { event, payload, playerId, gameId } = response;
      let parsedPayload = undefined;

      switch (event) {
        case Event.ROUND_END:
        case Event.ROUND_START:
        case Event.GAME_END:
        case Event.GAME_START:
          publishFunction(`game_${gameId}`, { event, payload });
          break;
        case Event.UNRECOGNIZED:
        case Event.CONNECTION_ESTABLISH:
          break;
        default:
          publishFunction(`player_${playerId}`, {
            event,
            payload,
          });
      }
    });
  },
  sendRoomEvent: async ({
    gameId,
    event,
    payload,
  }: {
    gameId: number;
    event: Event;
    payload: Buffer;
  }) => {
    try {
      await unaryCall(gameServiceClient.sendRoomEvent.bind(gameServiceClient), {
        gameId,
        event,
        payload,
      });
    } catch (err) {
      console.error('Error sending room event:', err);
      throw err;
    }
  },
};
