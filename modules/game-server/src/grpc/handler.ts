import { Server } from '@grpc/grpc-js';
import { MahjongRoomV1 } from 'proto';
import { Status } from '@grpc/grpc-js/build/src/constants';
import type { GameInstanceManager } from '../manager/gameInstanceManager';

import { connectionManager } from '@/classes/connectionManager';
import {
  ReactionMessage,
  GameChannelInfo,
  GameEventMessage,
} from 'proto/src/generated/services/room';

export function createGrpcServer(manager: GameInstanceManager): Server {
  const server = new Server();
  server.addService(MahjongRoomV1.RoomServicesService, {
    createRoom: async (call, callback) => {
      const { gameId } = call.request;
      if (!gameId) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          message: 'Room ID is required',
        });
      }
      manager.createGameInstance(gameId);
      callback(null, { gameId });
    },
    sendRoomEvent: async (call, callback) => {
      const { gameId, event, payload } = call.request;
      if (!gameId || !event) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          message: 'Game ID and event are required',
        });
      }
      let gameInstance;
      try {
        gameInstance = manager.getGameInstance(gameId);
      } catch (err) {
        return callback({
          code: Status.NOT_FOUND,
          message: `Game with ID ${gameId} not found`,
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

      try {
        // forward to game instance for processing
        // gameInstance.processedReceivedRoomAction expects (event, payload)
        (gameInstance as any).processedReceivedRoomAction(event, parsedPayload);
        callback(null, { ok: true });
      } catch (err) {
        return callback({
          code: Status.INTERNAL,
          message: 'Failed to process room event',
        });
      }
    },
    subscribeRoomEvents: async (call) => {
      const { gameId } = call.request;
      if (!gameId) {
        // no room specified, close stream
        call.end();
        return;
      }
      // create a connection bound to this room so broadcasts reach this subscriber
      const connection = connectionManager.createRoomConnection(`${gameId}`);
      const connectionId = connection.getConnectionId();

      // when connection emits messages, forward to stream
      const messageHandler = (msg: MahjongRoomV1.GameEventMessage) => {
        try {
          const roomInfo = GameEventMessage.fromJSON(msg as any);
          call.write(roomInfo);
        } catch (e) {
          console.error('Failed to send message to client:', e);
        }
      };
      connection.getEventEmitter().on('message', messageHandler);

      call.on('close', () => {
        connection.getEventEmitter().off('message', messageHandler);
        connectionManager.unregisterRoomConnection(`${gameId}`, connectionId);
        connectionManager.removeConnection(connectionId);
      });
    },
    gameChannel: async (call) => {
      // Bidirectional streaming: bind a Connection to this call and route messages.
      const connection = connectionManager.createConnection();
      const connectionId = connection.getConnectionId();

      // forward outgoing messages from connection to client stream
      const outgoing = (msg: MahjongRoomV1.ReactionMessage) => {
        try {
          const reactionInfo = ReactionMessage.fromJSON(msg);

          call.write(reactionInfo);
        } catch (e) {
          console.error('Failed to send message to client:', e);
        }
      };
      connection.getEventEmitter().on('message', outgoing);

      let boundGameId: number | null = null;
      call.on('data', (request: MahjongRoomV1.ReactionMessage) => {
        // Expecting request to contain: { gameId, event, payload, playerId }
        const { gameId, payload, playerId } = request;
        let parsedPayload = payload;
        try {
          if (payload && Buffer.isBuffer(payload)) {
            parsedPayload = JSON.parse(Buffer.from(payload).toString());
          }
        } catch (e) {
          console.error('Failed to parse incoming payload:', e);
          return;
        }
        if (!gameId || !request.event) {
          // missing routing info
          return;
        }
        // bind this connection to the room on first received message
        if (!boundGameId) {
          boundGameId = gameId;
          connectionManager.addConnectionToRoom(`${gameId}`, connectionId);
        }
        if (!playerId) {
          // missing player ID
          return;
        }
        try {
          const gameInstance = manager.getGameInstance(gameId);
          gameInstance.processedReceivedRoomAction(
            request.event,
            parsedPayload,
          );
        } catch (e) {
          // could not find game instance or processing failed
        }
      });

      call.on('end', () => {
        connection.getEventEmitter().off('message', outgoing);
        if (boundGameId)
          connectionManager.unregisterRoomConnection(
            `${boundGameId}`,
            connectionId,
          );
        connectionManager.removeConnection(connectionId);
        call.end();
      });

      call.on('error', (err) => {
        connection.getEventEmitter().off('message', outgoing);
        connectionManager.removeConnection(connectionId);
      });
    },
  } as MahjongRoomV1.RoomServicesServer);
  return server;
}
