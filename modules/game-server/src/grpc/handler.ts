import { Server } from '@grpc/grpc-js';
import { MahjongRoomV1 } from 'proto';
import { Status } from '@grpc/grpc-js/build/src/constants';
import type { GameInstanceManager } from '../manager/gameInstanceManager';

export function createGrpcServer(manager: GameInstanceManager): Server {
  const server = new Server();
  server.addService(MahjongRoomV1.RoomServicesService, {
    createRoom: async (call, callback) => {
      const { roomId } = call.request;
      if (!roomId) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          message: 'Room ID is required',
        });
      }
      manager.createGameInstance(roomId);
      callback(null, { roomId });
    },
    sendRoomEvent: async (call, callback) => {
      const { roomId, event, payload } = call.request;
      if (!roomId || !event) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          message: 'Room ID and event are required',
        });
      }
      if (!manager.getGameInstance(roomId)) {
        return callback({
          code: Status.NOT_FOUND,
          message: `Room with ID ${roomId} not found`,
        });
      }
      let parsedPayload = undefined;
      try {
        parsedPayload = payload
          ? JSON.parse(Buffer.from(payload).toString())
          : undefined;
      } catch (error) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          message: 'Invalid payload format',
        });
      }
      manager.getGameInstance(roomId);
    },
    subscribeRoomEvents: async (call) => {
      // do something when client subscribes to room events (e.g., add them to a list of subscribers for the specified room)
    },
    gameChannel: async (call) => {
      // Implement bidirectional streaming logic here (e.g., handling game state updates and player actions)
      call.on('data', (request) => {
        // Handle incoming messages from the client
      });
      call.on('end', () => {
        // Handle stream end
      });
      call.on('error', (error) => {
        // Handle stream errors
      });
      // Send messages to the client using call.write() as needed
    },
  } as MahjongRoomV1.RoomServicesServer);
  return server;
}
