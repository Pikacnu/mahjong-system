import {
  createWebHandler,
  MessageSourceEnum,
  PlayerMessageEnum,
  type Message,
} from 'utils';
import { validatePlayerMessage } from './src/utils';
import { gameServiceClient } from './src/grpc/gameServer';

const webServer = createWebHandler({
  fetch(req, server) {
    const pathname = new URL(req.url).pathname;
    if (pathname.startsWith('/ws')) {
      const playerId = new URL(req.url).searchParams.get('playerId');

      if (!playerId) {
        return Response.json(
          {
            message: 'Player ID is required for WebSocket connection',
          },
          {
            status: 400,
          },
        );
      }

      server.upgrade(req, {
        data: {
          playerId,
          gameId: '',
        },
      });

      return;
    }
    return Response.json(
      {
        message: 'Hello from Lobby Server!',
      },
      {
        status: 200,
      },
    );
  },
  websocket: {
    data: {} as {
      playerId: string;
      gameId: string;
    },
    open(ws) {
      console.log('WebSocket connection opened for player:', ws.data.playerId);
      ws.subscribe(`player_${ws.data.playerId}`);
    },
    message(ws, message) {
      console.log(
        'Message received from player:',
        ws.data.playerId,
        'Message:',
        message,
      );
      try {
        let parsedMessage: unknown;
        if (typeof message === 'string') {
          parsedMessage = JSON.parse(message);
        } else if (message instanceof ArrayBuffer) {
          const decoder = new TextDecoder();
          const text = decoder.decode(message);
          parsedMessage = JSON.parse(text);
        }

        console.log(
          'Parsed message from player:',
          ws.data.playerId,
          'Parsed Message:',
          parsedMessage,
        );

        const verifiedMessage: any = {
          ...validatePlayerMessage(parsedMessage),
          sourceType: MessageSourceEnum.Player,
        };

        switch (verifiedMessage.messageType) {
          case PlayerMessageEnum.PlayerConnected: {
            if (!verifiedMessage.payload.gameId) {
              throw new Error(
                'gameId is required in payload for PlayerConnected message',
              );
            }
            ws.subscribe(`game_${verifiedMessage.payload.gameId}`);
            ws.data.gameId = verifiedMessage.payload.gameId;
            break;
          }
          default: {
            if (!verifiedMessage.payload.gameId) {
              throw new Error(
                'gameId is required in payload for player messages',
              );
            }
          }
        }
      } catch (e) {
        console.error(
          'Failed to parse message from player:',
          ws.data.playerId,
          'Message:',
          message,
          'Error:',
          e,
        );
        ws.send(
          JSON.stringify({
            error: 'Invalid message format. Expected JSON.',
          }),
        );
        return;
      }
    },
    close(ws, code, reason) {
      console.log(
        'WebSocket connection closed for player:',
        ws.data.playerId,
        'Code:',
        code,
        'Reason:',
        reason,
      );
    },
  },
});

const sendMessage = (topic: string, message: unknown) => {
  webServer.publish(topic, JSON.stringify(message));
};

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  webServer.stop();
});
