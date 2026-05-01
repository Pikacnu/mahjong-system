import { db } from '#/db/index';
import { room } from '#/db/schema';
import { eq } from 'drizzle-orm';

export const GET = async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const gameId = searchParams.get('gameId');

  if (!gameId || Number.isNaN(Number(gameId))) {
    return Response.json({ message: 'gameId is required' }, { status: 400 });
  }

  const roomData = await db
    .select()
    .from(room)
    .where(eq(room.id, Number(gameId)))
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
  const body = (await request.json()) as {
    status?: 'waiting' | 'playing' | 'finished';
  };

  const now = Date.now();
  const createdRoom = await db
    .insert(room)
    .values({
      status: body.status ?? 'waiting',
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      gameId: room.id,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    });

  return Response.json(createdRoom[0], { status: 200 });
};

export const gameManagerHandler = { GET, POST };
