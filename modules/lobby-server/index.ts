import { createWebHandler, MessageSourceEnum, PlayerMessageEnum } from 'utils';
import { validatePlayerMessage } from './src/utils';
import { gameServices, gameServiceClient } from './src/grpc/gameServer';

const webServer = createWebHandler({
  fetch(req, server) {
    const pathname = new URL(req.url).pathname;
    if (pathname === '/health') {
      return Response.json(
        {
          status: 'ok',
        },
        {
          status: 200,
        },
      );
    }
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
        message: 'Not Found',
      },
      {
        status: 404,
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
    async message(ws, message) {
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
          // @ts-ignore
          case PlayerMessageEnum.PlayerConnected: {
            if (!ws.data.gameId) {
              if (!verifiedMessage.payload.gameId) {
                throw new Error(
                  'gameId is required in payload for PlayerConnected message',
                );
              }
              const gameCheckResponse = await fetch(
                `${process.env.API_URL || 'http://localhost:30000'}/api/game/management?gameId=${verifiedMessage.payload.gameId}`,
              );
              if (!gameCheckResponse.ok) {
                switch (gameCheckResponse.status) {
                  case 404:
                    throw new Error(
                      `Game with ID ${verifiedMessage.payload.gameId} not found`,
                    );
                  default:
                    throw new Error(
                      `Failed to verify game existence. Status: ${gameCheckResponse.status}, StatusText: ${gameCheckResponse.statusText}`,
                    );
                }
              }
              const roomInfo = (await gameCheckResponse.json()) as {
                status: string;
                playerInfo: Array<{ name: string; id: number }>;
              };
              if (
                !roomInfo.playerInfo.some(
                  (player) => player.id === Number(ws.data.playerId),
                )
              ) {
                throw new Error(
                  `Player with ID ${ws.data.playerId} is not in the game with ID ${verifiedMessage.payload.gameId}`,
                );
              }
              ws.subscribe(`game_${verifiedMessage.payload.gameId}`);
              ws.data.gameId = verifiedMessage.payload.gameId;
              gameServices.createGameChannel(
                verifiedMessage.payload.gameId,
                (target, message) => {
                  ws.publish(target, JSON.stringify(message));
                },
              );
              break;
            }
            // If already has gameId, fall through to default for forwarding
          }
          default: {
            const gameId = verifiedMessage.payload.gameId || ws.data.gameId;
            if (!gameId) {
              throw new Error(
                'gameId is required in payload or session for player messages',
              );
            }
            if (ws.data.gameId && ws.data.gameId !== gameId) {
              throw new Error(
                `Mismatched gameId. Message gameId: ${gameId}, Session gameId: ${ws.data.gameId}`,
              );
            }
            // Forward to game server
            gameServiceClient.sendRoomEvent(
              {
                gameId: Number(gameId),
                event: verifiedMessage.messageType as any, // Map if necessary, but assume they align for now or handle specifically
                payload: Buffer.from(JSON.stringify(verifiedMessage.payload)),
              },
              (err) => {
                if (err) {
                  console.error(
                    'Failed to forward message to game server:',
                    err,
                  );
                }
              },
            );
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
