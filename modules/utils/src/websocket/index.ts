import { z } from 'zod';

export enum MessageSourceEnum {
  System,
  Game,
  Room,
  Player,
}

export enum RoomMessageEnum {
  PlayerJoined,
  PlayerLeft,
  GameInfoUpdated,
  PlayerConnected,
  PlayerDisconnected,
  PlayerReady,
  PlayerNotReady,
}

export enum GameMessageEnum {
  GameStart,
  GameEnd,
  RoundStart,
  RoundEnd,
  ChangePlayerHand,
  PlayerGetsTile,
  PlayerDrawsTile,
  PlayerDiscardsTile,
  PlayerChi,
  PlayerPon,
  PlayerKan,
  PlayerRon,
  PlayerTsumo,
  PlayerRiichi,
  RoundStatusChanged,
  ShowActions,
  ShowAvailableActions,
  ShowHint,
  ShowError,
  ShowInfo,
}

export enum PlayerMessageEnum {
  PlayerConnected,
  PlayerJoins,
  PlayerLeaves,
  PlayerReady,
  PlayerNotReady,
  PlayerDrawsTile,
  PlayerDiscardsTile,
  PlayerPerformsAction,
}

export type CommunicationMessageTypes = {
  [MessageSourceEnum.System]: never;
  [MessageSourceEnum.Game]: GameMessageEnum;
  [MessageSourceEnum.Room]: RoomMessageEnum;
  [MessageSourceEnum.Player]: PlayerMessageEnum;
};

export enum GameEndTypeEnum {
  Ron,
  Tsumo,
  OutOfTiles,
  Other,
}

export const GameMessagePayloadsSchema = z.object({
  [GameMessageEnum.GameStart]: z.object({
    gameId: z.string(),
    playerIds: z.array(z.string()),
  }),
  [GameMessageEnum.GameEnd]: z.object({
    gameId: z.string(),
    playerIds: z.array(z.string()),
    result: z.any(),
  }),
  [GameMessageEnum.PlayerGetsTile]: z.object({
    playerId: z.string(),
    tile: z.any(),
  }),
  [GameMessageEnum.PlayerDrawsTile]: z.object({
    playerId: z.string(),
    tile: z.any(),
  }),
  [GameMessageEnum.PlayerDiscardsTile]: z.object({
    playerId: z.string(),
    tile: z.any(),
  }),
  [GameMessageEnum.RoundStart]: z.object({}),
  [GameMessageEnum.RoundEnd]: z.object({
    type: z.nativeEnum(GameEndTypeEnum),
    payload: z.unknown().optional(),
  }),
  [GameMessageEnum.PlayerChi]: z.object({
    playerId: z.string(),
    tiles: z.array(z.any()),
  }),
  [GameMessageEnum.PlayerPon]: z.object({
    playerId: z.string(),
    tiles: z.array(z.any()),
  }),
  [GameMessageEnum.PlayerKan]: z.object({
    playerId: z.string(),
    tiles: z.array(z.any()),
  }),
  [GameMessageEnum.PlayerRon]: z.object({
    playerId: z.string(),
    tiles: z.array(z.any()),
  }),
  [GameMessageEnum.PlayerTsumo]: z.object({
    playerId: z.string(),
    tiles: z.array(z.any()),
  }),
  [GameMessageEnum.PlayerRiichi]: z.object({
    playerId: z.string(),
    tiles: z.array(z.any()),
  }),
  [GameMessageEnum.ShowActions]: z.object({
    playerId: z.string(),
    actions: z.array(z.any()),
  }),
  [GameMessageEnum.ShowAvailableActions]: z.object({
    playerId: z.string(),
    actions: z.array(z.any()),
  }),
  [GameMessageEnum.ShowHint]: z.object({
    playerId: z.string(),
    hint: z.unknown(),
  }),
  [GameMessageEnum.ShowError]: z.object({
    playerId: z.string(),
    error: z.string(),
  }),
  [GameMessageEnum.ShowInfo]: z.object({
    playerId: z.string(),
    info: z.unknown(),
  }),
  [GameMessageEnum.RoundStatusChanged]: z.object({
    roundStatus: z.any(),
  }),
  [GameMessageEnum.ChangePlayerHand]: z.object({
    newHand: z.array(z.number()),
  }),
});

export type GameMessagePayloads = z.infer<typeof GameMessagePayloadsSchema>;

export const RoomMessagePayloadsSchema = z.object({
  [RoomMessageEnum.PlayerJoined]: z.object({ playerId: z.string() }),
  [RoomMessageEnum.PlayerLeft]: z.object({ playerId: z.string() }),
  [RoomMessageEnum.GameInfoUpdated]: z.object({
    gameId: z.string(),
    info: z.any().optional(),
  }),
  [RoomMessageEnum.PlayerConnected]: z.object({ playerId: z.string() }),
  [RoomMessageEnum.PlayerDisconnected]: z.object({ playerId: z.string() }),
  [RoomMessageEnum.PlayerReady]: z.object({ playerId: z.string() }),
  [RoomMessageEnum.PlayerNotReady]: z.object({ playerId: z.string() }),
});

export type RoomMessagePayloads = z.infer<typeof RoomMessagePayloadsSchema>;

export type MessagePayloadType<
  T extends MessageSourceEnum,
  T2 extends CommunicationMessageTypes[T] = CommunicationMessageTypes[T],
> = T extends MessageSourceEnum.Game
  ? GameMessagePayloads[T2 & keyof GameMessagePayloads]
  : T extends MessageSourceEnum.Room
    ? RoomMessagePayloads[T2 & keyof RoomMessagePayloads]
    : never;

export type Message<
  T extends MessageSourceEnum,
  T2 extends CommunicationMessageTypes[T] = CommunicationMessageTypes[T],
> = T extends any
  ? {
      sourceType: T;
      messageType: T2;
      payload: MessagePayloadType<T, T2>;
    }
  : never;
