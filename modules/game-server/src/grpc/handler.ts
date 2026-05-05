import { Server } from '@grpc/grpc-js';
import { MahjongRoomV1, unaryCall } from 'proto';
import type { GameInstanceManager } from '../manager/gameInstanceManager';

import { connectionManager } from '@/classes/connectionManager';
import {
  ReactionMessage,
  GameEventMessage,
} from 'proto/src/generated/services/room';
import { ErrorCode } from 'proto/src/generated/common';
import { Empty } from 'proto/src/generated/google/protobuf/empty';
import { createStorageGateway } from './gateways';
import { FUNCTION_STORAGE_HOSTNAME, GRPC_PORT } from 'utils';

const storageGateway = createStorageGateway(
  `${FUNCTION_STORAGE_HOSTNAME}:${GRPC_PORT}`,
);

export function createGrpcServer(manager: GameInstanceManager): Server {
  const server = new Server();
  server.addService(MahjongRoomV1.RoomServicesService, {
    createRoom: async (call, callback) => {
      const { gameId } = call.request;
      if (!isNaN(gameId)) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Room ID is required',
          },
        });
      }
      manager.createGameInstance(gameId);
      callback(null, { success: true, gameId });
    },
    sendRoomEvent: async (call, callback) => {
      const { gameId, event, payload } = call.request;
      if (!gameId || event === undefined) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Game ID and event are required',
          },
        });
      }
      let gameInstance;
      try {
        gameInstance = manager.getGameInstance(gameId);
      } catch (err) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `Game with ID ${gameId} not found`,
          },
        });
      }

      try {
        // forward to game instance for processing
        gameInstance.processedReceivedRoomAction(event, payload);
        callback(null, { success: true, data: Empty.create() });
      } catch (err) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message:
              'Failed to process room event, error: ' + (err as Error).message,
          },
        });
      }
    },
    subscribeRoomEvents: async (call) => {
      const { gameId } = call.request;
      if (!gameId) {
        call.end();
        return;
      }
      const connection = connectionManager.createRoomConnection(`${gameId}`);
      const connectionId = connection.getConnectionId();

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
      const connection = connectionManager.createConnection();
      const connectionId = connection.getConnectionId();
      let isBoundToGame = false;

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
        const { gameId, payload, playerId } = request;

        if (!isBoundToGame) {
          if (!gameId) {
            console.error(
              'First message must contain gameId to bind connection',
            );
            return;
          }
          boundGameId = gameId;
          connectionManager.addConnectionToRoom(`${gameId}`, connectionId);
          isBoundToGame = true;
        }

        if (!gameId || request.event === undefined) return;
        if (!boundGameId) {
          boundGameId = gameId;
          connectionManager.addConnectionToRoom(`${gameId}`, connectionId);
        }
        if (!playerId) return;

        try {
          const gameInstance = manager.getGameInstance(gameId);
          gameInstance.processedReceivedRoomAction(request.event, payload);
        } catch (e) {}
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
    addRoomPlugin: async (call, callback) => {
      const { gameId, pluginInfo, priority } = call.request;
      if (!gameId || !pluginInfo) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing gameId or pluginInfo',
          },
        });
      }

      try {
        storageGateway.getPluginDefinition({
          methodInfo: pluginInfo,
        });
      } catch (err) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Failed to validate plugin info with storage service',
          },
        });
      }
      const gameInstance = manager.getGameInstance(gameId);
      try {
        // WIP
        throw new Error('Plugin management is not implemented yet');
        await gameInstance.addPlugin(pluginInfo, priority);
        callback(null, { success: true });
      } catch (err) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Failed to add plugin to game instance',
          },
        });
      }
    },
    removeRoomPlugin: async (call, callback) => {
      const { gameId, pluginInfo } = call.request;
      if (!gameId || !pluginInfo) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing gameId or pluginId',
          },
        });
      }
      const gameInstance = manager.getGameInstance(gameId);
      try {
        throw new Error('Plugin management is not implemented yet');
      } catch (err) {
        return callback(null, {
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Failed to remove plugin from game instance',
          },
        });
      }
    },
    listRoomPlugins: async (call, callback) => {},
  } as MahjongRoomV1.RoomServicesServer);
  return server;
}
