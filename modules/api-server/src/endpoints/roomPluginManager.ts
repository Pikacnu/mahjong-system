import { gameServiceClient } from '@/handler/room';
import { unaryCall } from 'proto';

export const GET = async (req: Request) => {
  const searchParams = new URL(req.url).searchParams;
  const roomId = searchParams.get('roomId');
  if (!roomId) {
    return Response.json({ message: 'roomId is required' }, { status: 400 });
  }
};

export const POST = async (req: Request) => {};
