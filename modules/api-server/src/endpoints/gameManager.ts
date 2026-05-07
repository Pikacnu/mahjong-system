import { db } from '#/db/index';
import { room } from '#/db/schema';
import { eq } from 'drizzle-orm';
import {
  createGameSchema,
  getGameSchema,
  handleValidationError,
} from '../utils/schemas';
import { unaryCall } from 'proto';

export const GET = async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const gameIdStr = searchParams.get('gameId');

  const validation = getGameSchema.safeParse({
    gameId: gameIdStr ? Number(gameIdStr) : undefined,
  });

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { gameId } = validation.data;

  try {
    const roomData = await db
      .select()
      .from(room)
      .where(eq(room.id, gameId))
      .limit(1);

    if (!roomData.length) {
      return Response.json({ message: 'Room not found' }, { status: 404 });
    }

    return Response.json(
      {
        gameId: roomData[0]!.id,
        status: roomData[0]!.status,
        createdAt: roomData[0]!.createdAt,
        updatedAt: roomData[0]!.updatedAt,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Error fetching game information',
      },
      {
        status: 500,
      },
    );
  }
};

export const POST = async (request: Request) => {
  const body = await request.json();
  const validation = createGameSchema.safeParse(body);

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { status } = validation.data;

  // check is room exists

  const currentSearchingRoomData = (
    await db.select().from(room).where(eq(room.status, status)).limit(1)
  )[0];

  if (!currentSearchingRoomData) {
    return Response.json(
      { message: 'No available room found' },
      { status: 404 },
    );
  }

  switch (currentSearchingRoomData.status) {
    case 'finished': {
      switch (status) {
        case 'playing':
        case 'finished': {
          return Response.json(
            { message: `Cannot set room status to ${status}` },
            { status: 400 },
          );
        }
        case 'waiting': {
          await db
            .update(room)
            .set({ status: 'waiting', updatedAt: new Date() })
            .where(eq(room.id, currentSearchingRoomData.id));
          return Response.json(
            {
              message: 'Room status updated to waiting',
              gameId: currentSearchingRoomData.id,
            },
            { status: 200 },
          );
        }
      }
    }
    case 'playing': {
      switch (status) {
        case 'waiting':
        case 'finished':
        case 'playing': {
          return Response.json(
            { message: `Cannot set room status to ${status}` },
            { status: 400 },
          );
        }
        default: {
          return Response.json(
            { message: 'Invalid room status' },
            { status: 400 },
          );
        }
      }
    }
    case 'waiting': {
      switch (status) {
        case 'finished':
        case 'waiting': {
          return Response.json(
            { message: `Cannot set room status to ${status}` },
            { status: 400 },
          );
        }
        case 'playing': {
          //const startGameResponse = await unaryCall();
          //const { success, error } = startGameResponse;
          // if (!success) {
          //   return Response.json(
          //     { message: 'Failed to create game instance', error },
          //     { status: 500 },
          //   );
          // }
          await db
            .update(room)
            .set({ status: 'playing', updatedAt: new Date() })
            .where(eq(room.id, currentSearchingRoomData.id));
          return Response.json(
            {
              message: 'Game started successfully',
              gameId: currentSearchingRoomData.id,
            },
            { status: 200 },
          );
        }
        default: {
          return Response.json(
            { message: 'Invalid room status' },
            { status: 400 },
          );
        }
      }
    }
  }
};

export const gameManagerHandler = { GET, POST };
