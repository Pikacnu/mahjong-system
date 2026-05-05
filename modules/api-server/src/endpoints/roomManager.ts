import { db } from '#/db/index';
import { player, room, roomPlayerBinding } from '#/db/schema';
import { eq } from 'drizzle-orm';
import {
  addPlayerToRoomSchema,
  createRoomSchema,
  handleValidationError,
} from '../utils/schemas';
import { unaryCall } from 'proto';
import { gameServiceClient } from '@/handler/room';
import { Event } from 'proto/src/generated/services/room';

export const GET = async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const roomId = searchParams.get('gameId');
  try {
    const searchRoomAndPlayerData = await db
      .select({
        status: room.status,
        playerName: player.name,
        playerId: player.id,
      })
      .from(room)
      .where(eq(room.id, Number(roomId)))
      .leftJoin(roomPlayerBinding, eq(roomPlayerBinding.roomId, room.id))
      .leftJoin(player, eq(player.id, roomPlayerBinding.playerId));

    if (
      !searchRoomAndPlayerData ||
      searchRoomAndPlayerData.length === 0 ||
      !searchRoomAndPlayerData[0]!.status
    ) {
      return new Response('Room not found', { status: 404 });
    }

    const searchRoomInfo = {
      status: searchRoomAndPlayerData[0]!.status,
      playerInfo: searchRoomAndPlayerData.map((data) => {
        return {
          name: data.playerName,
          id: data.playerId,
        };
      }),
    };

    return new Response(JSON.stringify(searchRoomInfo), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return Response.json(
      {
        message: 'Error fetching room information',
      },
      { status: 500 },
    );
  }
};

export const POST = async (request: Request) => {
  const body = await request.json();
  const addPlayerValidation = addPlayerToRoomSchema.safeParse(body);
  const createRoomValidation = createRoomSchema.safeParse(body);

  try {
    switch (true) {
      case addPlayerValidation.success: {
        const { playerId, roomId } = addPlayerValidation.data;

        const addPlayerExecutionResult = await db.transaction(async (tx) => {
          const searchPlayerData = await tx
            .select()
            .from(player)
            .where(eq(player.id, playerId))
            .limit(1);
          if (!searchPlayerData || searchPlayerData.length === 0) {
            tx.rollback();
            return Response.json(
              { message: 'Player not found' },
              { status: 404 },
            );
          }
          const searchRoomData = await tx
            .select()
            .from(room)
            .where(eq(room.id, roomId))
            .limit(1);
          if (!searchRoomData || searchRoomData.length === 0) {
            tx.rollback();
            return Response.json(
              { message: 'Room not found' },
              { status: 404 },
            );
          }
          await tx.insert(roomPlayerBinding).values({
            roomId,
            playerId,
          });
          const addPlayerRoRoomEventResponse = await unaryCall(
            gameServiceClient.sendRoomEvent.bind(gameServiceClient),
            {
              gameId: roomId,
              event: Event.PLAYER_JOINED,
              payload: {},
            },
          );
          if (!addPlayerRoRoomEventResponse.success) {
            tx.rollback();
            console.log(
              'Failed to send player joined event to game server for playerId:',
              playerId,
              'roomId:',
              roomId,
              'error:',
              addPlayerRoRoomEventResponse.error,
            );
            return Response.json(
              {
                message:
                  'Failed to send player joined event to game server,error:' +
                  addPlayerRoRoomEventResponse.error?.message,
              },
              { status: 500 },
            );
          }
        });
        return addPlayerExecutionResult;
      }

      case createRoomValidation.success: {
        const {} = createRoomValidation.data;
        const now = Date.now();
        const createRoomResult = await db.transaction(async (tx) => {
          const insertRoomData = (
            await tx
              .insert(room)
              .values({
                status: 'waiting',
                createdAt: now,
                updatedAt: now,
              })
              .returning({
                id: room.id,
                status: room.status,
                createdAt: room.createdAt,
                updatedAt: room.updatedAt,
              })
          )[0];
          if (!insertRoomData) {
            tx.rollback();
            return Response.json(
              { message: 'Failed to create room' },
              { status: 500 },
            );
          }
          const createRoomResponse = await unaryCall(
            gameServiceClient.createRoom.bind(gameServiceClient),
            {
              gameId: insertRoomData.id,
            },
          );
          if (
            !createRoomResponse.success ||
            createRoomResponse.gameId === undefined
          ) {
            tx.rollback();
            return Response.json(
              { message: 'Failed to create game room' },
              { status: 500 },
            );
          }
          return Response.json(
            {
              message: 'Room created successfully',
            },
            { status: 200 },
          );
        });
        return createRoomResult;
      }
      default: {
        return Response.json(
          handleValidationError(createRoomValidation.error),
          {
            status: 400,
          },
        );
      }
    }
  } catch (error) {
    console.error('Error processing room manager request:', error);
    return Response.json(
      {
        message: 'Internal server error',
      },
      { status: 500 },
    );
  }
};

export const roomManagerHandler = {
  GET,
  POST,
};
