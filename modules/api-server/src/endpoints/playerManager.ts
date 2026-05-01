import { db } from '#/db/index';
import { player } from '#/db/schema';
import { eq } from 'drizzle-orm';

export const GET = async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const playerId = searchParams.get('playerId');
  const searchPlayerData = (
    await db
      .select()
      .from(player)
      .where(eq(player.id, Number(playerId)))
      .limit(1)
  )[0];
  return Response.json(searchPlayerData, {
    status: 200,
  });
};

export const POST = async (request: Request) => {
  const { playerName } = (await request.json()) as { playerName: string };
  if (
    !playerName ||
    typeof playerName !== 'string' ||
    playerName.trim() === '' ||
    playerName.length > 50 ||
    ['\n', '\r', '\t'].some((char) => playerName.includes(char))
  ) {
    return Response.json(
      {
        error:
          'Player name is required and must be between 1 and 50 characters',
      },
      { status: 400 },
    );
  }

  const insertPlayerData = await db
    .insert(player)
    .values({
      name: playerName,
    })
    .returning({
      id: player.id,
      name: player.name,
    });

  return Response.json(insertPlayerData[0], {
    status: 200,
  });
};

export const playerManagerHandler = {
  GET,
  POST,
};
