export enum MessageEnum {
  System,
  Game,
  Room,
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

  PlayerGetsTile,
  PlayerDrawsTile,
  PlayerDiscardsTile,

  PlayerChi,
  PlayerPon,
  PlayerKan,
  PlayerRon,
  PlayerTsumo,
  PlayerRiichi,

  ShowActions,
  ShowAvailableActions,

  ShowHint,
  ShowError,

  ShowInfo,
}

export type MessageEnums = {
  [MessageEnum.System]: never;
  [MessageEnum.Game]: GameMessageEnum;
  [MessageEnum.Room]: RoomMessageEnum;
};

export enum GameEndTypeEnum {
  Ron,
  Tsumo,
  OutOfTiles,
  Other,
}

// Payload map for Game message types
export type GameMessagePayloads = {
  [GameMessageEnum.GameStart]: {
    gameId: string;
    playerIds: string[];
  };
  [GameMessageEnum.GameEnd]: {
    gameId: string;
    playerIds: string[];
    result: any;
  };
  [GameMessageEnum.PlayerGetsTile]: {
    playerId: string;
    tile: any;
  };
  [GameMessageEnum.PlayerDrawsTile]: {
    playerId: string;
    tile: any;
  };
  [GameMessageEnum.PlayerDiscardsTile]: {
    playerId: string;
    tile: any;
  };
  [GameMessageEnum.RoundStart]: {};
  [GameMessageEnum.RoundEnd]: {
    type: GameEndTypeEnum;
    payload?: unknown;
  };
  [GameMessageEnum.PlayerChi]: {
    playerId: string;
    tiles: any[];
  };
  [GameMessageEnum.PlayerPon]: {
    playerId: string;
    tiles: any[];
  };
  [GameMessageEnum.PlayerKan]: {
    playerId: string;
    tiles: any[];
  };
  [GameMessageEnum.PlayerRon]: {
    playerId: string;
    tiles: any[];
  };
  [GameMessageEnum.PlayerTsumo]: {
    playerId: string;
    tiles: any[];
  };
  [GameMessageEnum.PlayerRiichi]: {
    playerId: string;
    tiles: any[];
  };
  [GameMessageEnum.ShowActions]: {
    playerId: string;
    actions: any[];
  };
  [GameMessageEnum.ShowAvailableActions]: {
    playerId: string;
    actions: any[];
  };
  [GameMessageEnum.ShowHint]: {
    playerId: string;
    hint: unknown;
  };
  [GameMessageEnum.ShowError]: {
    playerId: string;
    error: string;
  };
  [GameMessageEnum.ShowInfo]: {
    playerId: string;
    info: unknown;
  };
};

// Payload map for Room message types (basic shapes, adjust as needed)
export type RoomMessagePayloads = {
  [RoomMessageEnum.PlayerJoined]: { playerId: string };
  [RoomMessageEnum.PlayerLeft]: { playerId: string };
  [RoomMessageEnum.GameInfoUpdated]: { gameId: string; info?: any };
  [RoomMessageEnum.PlayerConnected]: { playerId: string };
  [RoomMessageEnum.PlayerDisconnected]: { playerId: string };
  [RoomMessageEnum.PlayerReady]: { playerId: string };
  [RoomMessageEnum.PlayerNotReady]: { playerId: string };
};

export type MessagePayloadType<
  T extends MessageEnum,
  T2 extends MessageEnums[T] = MessageEnums[T],
> = T extends MessageEnum.Game
  ? GameMessagePayloads[T2 & keyof GameMessagePayloads]
  : T extends MessageEnum.Room
    ? RoomMessagePayloads[T2 & keyof RoomMessagePayloads]
    : never;

export type Message<
  T extends MessageEnum,
  T2 extends MessageEnums[T],
> = T extends any
  ? {
      sourceType: T;
      messageType: T2;
      payload: MessagePayloadType<T, T2>;
    }
  : never;
