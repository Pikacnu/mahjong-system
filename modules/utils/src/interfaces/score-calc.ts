import type { PlayerActionTileEntry, MahjongTile } from '../mahjong/type';

export type scoreCalcPayload = {
  calcuation: {
    checkedYakuList: string[];
    han: number;
    fu: number;
    score: number;
    basePoints: number;
    isYakuman: boolean;
  };
  result: {};
};

export type ActionSharedDataPlayersData = {
  playerId: string;
  handCount: number;
  openedTiles: PlayerActionTileEntry[];
  isRiichi: boolean;
};

export type ActionSharedData = {
  roundIndex: number;
  currentPlayerId: string;
  isCurrentPlayer: boolean;
  playersData: ActionSharedDataPlayersData[];
  lastAction?: PlayerActionTileEntry;
  doraIndicators: MahjongTile[];
  currentDiscard?: MahjongTile;
  isFirstTurn: boolean;
};
