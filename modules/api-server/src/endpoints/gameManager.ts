import { db } from '#/db/index';
import { room } from '#/db/schema';
import { eq } from 'drizzle-orm';
import {
  createGameSchema,
  getGameSchema,
  handleValidationError,
} from '../utils/schemas';

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

  try {
    const createdRoom = await db
      .insert(room)
      .values({
        status,
      })
      .returning({
        gameId: room.id,
        status: room.status,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      });
    return Response.json(createdRoom[0], { status: 200 });
  } catch (e) {
    console.error('Error creating room:', e);
    return Response.json(
      {
        message: 'Failed to create room',
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );
  }
};

export const gameManagerHandler = { GET, POST };
