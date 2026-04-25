import type { MahjongTile, PlayerActionTileEntry } from 'utils';

export type ActionSharedData = {
  roundIndex: number;
  currentPlayerId: string;
  isCurrentPlayer: boolean;
  PlayersData: ActionSharedDataPlayersData[];
  lastAction?: PlayerActionTileEntry;
  doraIndicators: MahjongTile[];
  currentDiscard?: MahjongTile;
  isFirstTurn: boolean;
};

export type ActionSharedDataPlayersData = {
  playerId: string;
  handCount: number;
  openedTiles: PlayerActionTileEntry[];
  isRiichi: boolean;
};
