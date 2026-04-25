import {
  PlayerAction,
  type DrawTile,
  type MahjongTile,
  type PlayerActionTileEntry,
} from 'utils';

export class Player {
  private handTiles: Array<DrawTile<MahjongTile>> = [];
  private usedTiles: Set<number> = new Set();
  private score: number = 0;
  private actionLogs: Array<PlayerActionTileEntry> = [];

  public setScore(score: number): void {
    this.score = score;
  }

  public getScore(): number {
    return this.score;
  }

  public getHandTiles(): Array<MahjongTile> {
    return this.handTiles.map((tile) => ({ ...tile }));
  }

  public replaceHandTiles(tiles: MahjongTile[]): void {
    this.handTiles = tiles;
  }

  public addHandTile(tile: MahjongTile): void {
    this.handTiles.push(
      Object.assign({}, tile, { isDrawTile: true }) as DrawTile<MahjongTile>,
    );
  }

  public removeHandTile(tile: MahjongTile): MahjongTile {
    const index = this.handTiles.findIndex(
      (t) => t.type === tile.type && t.index === tile.index,
    );
    if (index === -1) {
      throw new Error('Tile not found in hand');
    }
    this.handTiles.splice(index, 1);
    return tile;
  }

  public removeHandTileByIndex(index: number): MahjongTile {
    if (index < 0 || index >= this.handTiles.length) {
      throw new Error('Index out of bounds');
    }
    return this.handTiles.splice(index, 1)[0]!;
  }

  public discardHandTile(tile: MahjongTile): MahjongTile {
    const index = this.handTiles.findIndex(
      (t) => t.type === tile.type && t.index === tile.index,
    );
    if (index === -1) {
      throw new Error('Tile not found in hand');
    }
    const [discardedTile] = this.handTiles.splice(index, 1) as [
      DrawTile<MahjongTile>,
    ];
    this.handTiles = this.handTiles.map((t) => {
      if (t.isDrawTile) {
        return { ...t, isDrawTile: false };
      }
      return t;
    });
    this.usedTiles.add(discardedTile.type * 100 + discardedTile.index);
    return discardedTile!;
  }

  public getUsedTiles(): Set<MahjongTile> {
    return new Set(
      [...this.usedTiles].map((tileNum) => ({
        type: Math.floor(tileNum / 100),
        index: tileNum % 100,
      })),
    );
  }

  public getActionLogs(): Array<PlayerActionTileEntry> {
    return this.actionLogs.map((entry) => ({ ...entry }));
  }

  public playerAction(actionEntry: PlayerActionTileEntry): void {
    this.actionLogs.push(actionEntry);
    switch (actionEntry.action) {
      case PlayerAction.Chi: {
        const missingTile = actionEntry.tiles.find(
          (tile) =>
            !this.handTiles.some(
              (t) => t.type === tile.type && t.index === tile.index,
            ),
        );
        if (!missingTile) {
          throw new Error('Invalid Chi action: no missing tile found');
        }
        for (const tile of actionEntry.tiles) {
          if (
            tile.type === missingTile.type &&
            tile.index === missingTile.index
          ) {
            continue;
          }
          this.removeHandTile(
            Object.assign({}, tile, { isDrawTile: false }) as MahjongTile,
          );
          this.usedTiles.add(tile.type * 100 + tile.index);
        }
        break;
      }
      case PlayerAction.Pon: {
        const matchingTile = actionEntry.tiles[0];
        if (
          !matchingTile ||
          !(
            this.handTiles.filter(
              (t) =>
                t.type === matchingTile.type && t.index === matchingTile.index,
            ).length >= 2
          )
        ) {
          throw new Error('Invalid Pon action: no matching tile found');
        }
        for (let i = 0; i < 2; i++) {
          this.removeHandTile(
            Object.assign({}, matchingTile, {
              isDrawTile: false,
            }) as MahjongTile,
          );
          this.usedTiles.add(matchingTile.type * 100 + matchingTile.index);
        }
        break;
      }
      case PlayerAction.Kan: {
        const matchingTile = actionEntry.tiles[0];
        if (
          !matchingTile ||
          !(
            this.handTiles.filter(
              (t) =>
                t.type === matchingTile.type && t.index === matchingTile.index,
            ).length >= 3
          )
        ) {
          throw new Error('Invalid Kan action: no matching tile found');
        }
        for (let i = 0; i < 3; i++) {
          this.removeHandTile(
            Object.assign({}, matchingTile, {
              isDrawTile: false,
            }) as MahjongTile,
          );
          this.usedTiles.add(matchingTile.type * 100 + matchingTile.index);
        }
        break;
      }
      case PlayerAction.Riichi:
      case PlayerAction.DrawTile: {
        this.discardHandTile(actionEntry.tiles[0]!);
        break;
      }
      default: {
        throw new Error(`Unsupported action ${actionEntry.action}`);
      }
    }
  }
  public getPlayerState() {
    return {};
  }
}
