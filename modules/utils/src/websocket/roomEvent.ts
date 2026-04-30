import z from 'zod';
import { RoomMessageEnum } from './index';

export const RoomEventPlayerJoined = z.object({
  playerId: z.string(),
});

export const RoomEventPlayerLeft = z.object({
  playerId: z.string(),
});

export const RoomEventPlayerReady = z.object({
  playerId: z.string(),
  ready: z.boolean(),
});

export const RoomEventGameInfoUpdated = z.object({
  gameInfo: z.object({
    gameId: z.string(),
    playerIds: z.array(z.string()),
    status: z.string(),
  }),
});

export const RoomEventPlayerConnected = z.object({
  playerId: z.string(),
});

export const RoomEventPlayerDisconnected = z.object({
  playerId: z.string(),
});

export const RoomEventMap = {
  [RoomMessageEnum.PlayerJoined]: RoomEventPlayerJoined,
  [RoomMessageEnum.PlayerLeft]: RoomEventPlayerLeft,
  [RoomMessageEnum.PlayerReady]: RoomEventPlayerReady,
  [RoomMessageEnum.GameInfoUpdated]: RoomEventGameInfoUpdated,
  [RoomMessageEnum.PlayerConnected]: RoomEventPlayerConnected,
  [RoomMessageEnum.PlayerDisconnected]: RoomEventPlayerDisconnected,
};
