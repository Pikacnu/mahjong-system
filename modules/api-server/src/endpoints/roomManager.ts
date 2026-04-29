import { db } from '#/db/index';
import { player, room, roomPlayerBinding } from '#/db/schema';
import { eq } from 'drizzle-orm';

export const GET = async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const roomId = searchParams.get('roomId');

  const searchRoomAndPlayerData = await db
    .select({
      status: room.status,
      playerName: player.name,
    })
    .from(room)
    .where(eq(room.id, Number(roomId)))
    .leftJoin(roomPlayerBinding, eq(roomPlayerBinding.roomId, room.id))
    .leftJoin(player, eq(player.id, roomPlayerBinding.playerId))
    .limit(1);

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
      };
    }),
  };

  return new Response(JSON.stringify(searchRoomInfo), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const POST = async (request: Request) => {
  const { playerId, roomId } = (await request.json()) as {
    playerId: number;
    roomId: number;
  };

  if (!playerId || !roomId || isNaN(playerId) || isNaN(roomId)) {
    return new Response('Player ID and Room ID are required', { status: 400 });
  }
  try {
    await db.transaction(async (tx) => {
      const searchPlayerData = await tx
        .select()
        .from(player)
        .where(eq(player.id, playerId))
        .limit(1);
      if (!searchPlayerData || searchPlayerData.length === 0) {
        throw new Error('Player not found');
      }
      const searchRoomData = await tx
        .select()
        .from(room)
        .where(eq(room.id, roomId))
        .limit(1);
      if (!searchRoomData || searchRoomData.length === 0) {
        throw new Error('Room not found');
      }
      await tx.insert(roomPlayerBinding).values({
        roomId,
        playerId,
      });
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 404 });
  }
  return Response.json(
    { message: 'Player added to room successfully' },
    { status: 200 },
  );
};

export const roomManagerHandler = {
  GET,
  POST,
};
