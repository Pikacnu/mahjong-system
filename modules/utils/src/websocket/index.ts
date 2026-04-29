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
  [GameMessageEnum.RoundStatusChanged]: {
    roundStatus: any;
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
