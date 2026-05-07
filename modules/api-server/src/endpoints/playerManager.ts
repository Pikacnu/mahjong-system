import { db } from '#/db/index';
import { player } from '#/db/schema';
import { eq } from 'drizzle-orm';
import { createPlayerSchema, handleValidationError } from '../utils/schemas';

export const GET = async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const playerId = searchParams.get('playerId');
  try {
    const searchPlayerData = (
      await db
        .select()
        .from(player)
        .where(eq(player.id, Number(playerId)))
        .limit(1)
    )[0];
    if (!searchPlayerData) {
      return Response.json({ message: 'Player not found' }, { status: 404 });
    }
    return Response.json(searchPlayerData, {
      status: 200,
    });
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Error fetching player information',
      },
      {
        status: 500,
      },
    );
  }
};

export const POST = async (request: Request) => {
  const body = await request.json();
  const validation = createPlayerSchema.safeParse(body);

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { playerName } = validation.data;
  try {
    const insertPlayerData = (
      await db
        .insert(player)
        .values({
          name: playerName,
        })
        .returning({
          id: player.id,
          name: player.name,
        })
    )[0];
    return Response.json(insertPlayerData, {
      status: 200,
    });
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Failed to create player',
      },
      {
        status: 500,
      },
    );
  }
};

export const playerManagerHandler = {
  GET,
  POST,
};
