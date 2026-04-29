import {
  createWebHandler,
  MessageSourceEnum,
  PlayerMessageEnum,
  type Message,
} from 'utils';
import { validatePlayerMessage } from './src/utils';

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
    },
    open(ws) {
      console.log('WebSocket connection opened for player:', ws.data.playerId);
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
        const verifiedMessage = {
          ...validatePlayerMessage(parsedMessage),
          sourceType: MessageSourceEnum.Player,
        };

        switch (verifiedMessage.messageType) {
          default: {
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
