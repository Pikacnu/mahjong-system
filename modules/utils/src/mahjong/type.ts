import z from 'zod';
import { type Enumerate } from '../types';

export enum MahjongTileType {
  Wind,
  Dragon,
  MAN,
  PIN,
  SOU,
  BLANK,
}

export interface MahjongTileToNumberLimit {
  [MahjongTileType.Wind]: Enumerate<4>;
  [MahjongTileType.Dragon]: Enumerate<3>;
  [MahjongTileType.MAN]: Enumerate<9>;
  [MahjongTileType.PIN]: Enumerate<9>;
  [MahjongTileType.SOU]: Enumerate<9>;
  [MahjongTileType.BLANK]: number;
}

export type MahjongTile = {
  [T in MahjongTileType]: {
    type: T;
    index: MahjongTileToNumberLimit[T];
  };
}[MahjongTileType];

export type RedDora<T> = T & {
  isRedDora: boolean;
};

export type UraDora<T> = T & {
  isUraDora: boolean;
};

export type DrawTile<T> = T & {
  isDrawTile?: boolean;
};

export enum MahjongGameRoundStatus {
  RoundStart,
  PlayerGetsTile,
  WaitingForPlayerAction,
  ResolvingPlayerAction,
  RoundEnd,
}

/*
回合開始時:
-> RoundStart
玩家摸牌
-> WaitingForPlayerDrawTile
玩家出牌
-> WaitingForPlayerAction
其他玩家決定是否要吃碰槓胡
-> ResolvingPlayerAction
回合結束
-> RoundEnd
*/

export enum MahjongGameStatus {
  Idling,
  StartGame,
  StartRound,
  RoundSettlement,
  RoundEnd,
  GameEnd,
}

/*
準備遊戲時
-> Idling
開始遊戲
-> StartGame
開始回合
-> StartRound
回合結束 (不論是和牌還是流局)
-> RoundEnd
結算回合
-> RoundSettlement
(如果還沒達到條件 則回到開始遊戲狀態 否則進入遊戲結束狀態)
遊戲結束 
-> GameEnd
*/

export enum MahjongGameLobbyStatus {
  WaitingForPlayers,
  GameInProgress,
  GameEnded,
}

/*
等待玩家加入
-> WaitingForPlayers
遊戲進行中
-> GameInProgress
遊戲結束
-> GameEnded
*/

export enum PlayerAction {
  DrawTile,
  Chi,
  Pon,
  Kan,
  Ron,
  Tsumo,
  Riichi,
}

export enum PlayerStatus {}

export type PlayerActionTileEntry = {
  action: PlayerAction;
  tiles: MahjongTile[];
};

export type Log = {
  timestamp: number;
  playerId: string;
  action: PlayerAction;
  tiles: MahjongTile[];
};

export type GameSnapshot = {
  timestamp: number;
  players: Array<{
    playerId: string;
    handTiles: MahjongTile[];
  }>;
  playerDrawedTiles: Map<string, Array<MahjongTile>>;
  playerActionTiles: Map<string, Array<PlayerActionTileEntry>>;
  redDoraTile: Array<MahjongTile>;
  uraDoraTile: Array<MahjongTile & { isOpen: boolean }>;
};

export type GameNextResponse = {
  requestId: string;
};

export type GameNextRequest = {
  requestId: string;
  args?: { [key: string]: any };
};

export const PlayerActionType = z.object({
  action: z.enum(PlayerAction),
  playerId: z.string(),
});

export enum TimeoutAction {
  Skip,
  DrawTile,
}

export type TimeoutActionEvent =
  | {
      action: TimeoutAction.Skip;
    }
  | {
      action: TimeoutAction.DrawTile;
      payload?:
        | {
            index: number;
          }
        | {
            tile: MahjongTile;
          };
    };
