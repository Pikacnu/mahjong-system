import type { MahjongTile, PlayerActionTileEntry } from 'utils';

export class Table {
  private tiles: Array<MahjongTile> = [];

  private playersDrawedTiles: Map<string, Array<MahjongTile>> = new Map();
  private playersUsedTiles: Map<string, Array<MahjongTile>> = new Map();
  private playersActionTiles: Map<string, Array<PlayerActionTileEntry>> =
    new Map();

  private playerIds: Array<string> = [];
  private redDoraTile: Array<MahjongTile> = [];
  private uraDoraTile: Array<
    MahjongTile & {
      isOpen: boolean;
    }
  > = [];

  public addPlayer(playerId: string): void {
    if (this.playerIds.includes(playerId)) {
      throw new Error('Player already exists at the table');
    }
    this.playerIds.push(playerId);
    this.playersDrawedTiles.set(playerId, []);
    this.playersUsedTiles.set(playerId, []);
    this.playersActionTiles.set(playerId, []);
  }

  public removePlayer(playerId: string): void {
    const index = this.playerIds.indexOf(playerId);
    if (index === -1) {
      throw new Error('Player not found at the table');
    }
    this.playerIds.splice(index, 1);
    this.playersDrawedTiles.delete(playerId);
    this.playersUsedTiles.delete(playerId);
    this.playersActionTiles.delete(playerId);
  }

  public addTile(tile: MahjongTile): void {
    this.tiles.push(tile);
  }

  public addTiles(tiles: Array<MahjongTile>): void {
    this.tiles.push(...tiles);
  }

  public shuffleTiles(): void {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j]!, this.tiles[i]!];
    }
  }

  public getTileByIndex(index: number): MahjongTile {
    if (index < 0 || index >= this.tiles.length) {
      throw new Error('Invalid tile index');
    }
    return this.tiles[index]!;
  }

  public removeTileByIndex(index: number): MahjongTile {
    if (index < 0 || index >= this.tiles.length) {
      throw new Error('Invalid tile index');
    }
    const [removedTile] = this.tiles.splice(index, 1);
    return removedTile!;
  }

  public getTilesCount(): number {
    return this.tiles.length;
  }

  public addRedDoraTile(tile: MahjongTile): void {
    this.redDoraTile.push(tile);
  }

  public removeRedDoraTile(tile: MahjongTile): void {
    const index = this.redDoraTile.findIndex(
      (t) => t.type === tile.type && t.index === tile.index,
    );
    if (index === -1) {
      throw new Error('Red Dora tile not found');
    }
    this.redDoraTile.splice(index, 1);
  }

  public removeTiles(index: number, count: number): Array<MahjongTile> {
    if (index < 0 || index >= this.tiles.length) {
      throw new Error('Invalid tile index');
    }
    if (count < 1 || index + count > this.tiles.length) {
      throw new Error('Invalid count for removing tiles');
    }
    const removedTiles = this.tiles.splice(index, count);
    return removedTiles;
  }

  public getRedDoraTiles(): Array<MahjongTile> {
    return this.redDoraTile.map((tile) => ({ ...tile }));
  }

  public addUraDoraTile(tile: MahjongTile): void {
    this.uraDoraTile.push({ ...tile, isOpen: false });
  }

  public getUraDoraTiles(): Array<MahjongTile & { isOpen: boolean }> {
    return this.uraDoraTile.map((tile) => ({ ...tile }));
  }

  public openUraDoraTile(index: number): void {
    if (index < 0 || index >= this.uraDoraTile.length) {
      throw new Error('Invalid index for Ura Dora tile');
    }
    this.uraDoraTile[index]!.isOpen = true;
  }

  public getOpenUraDoraTiles(): Array<MahjongTile> {
    return this.uraDoraTile
      .filter((tile) => tile.isOpen)
      .map((tile) => ({ ...tile }));
  }

  public getPlayerDrawedTiles(playerId: string): Array<MahjongTile> {
    const tiles = this.playersDrawedTiles.get(playerId);
    if (!tiles) {
      throw new Error('Player not found at the table');
    }
    return tiles.map((tile) => ({ ...tile }));
  }

  public addPlayerDrawedTile(playerId: string, tile: MahjongTile): void {
    const tiles = this.playersDrawedTiles.get(playerId);
    if (!tiles) {
      throw new Error('Player not found at the table');
    }
    tiles.push(tile);
  }

  public getPlayerUsedTiles(playerId: string): Array<MahjongTile> {
    const tiles = this.playersUsedTiles.get(playerId);
    if (!tiles) {
      throw new Error('Player not found at the table');
    }
    return tiles.map((tile) => ({ ...tile }));
  }

  public addPlayerUsedTile(playerId: string, tile: MahjongTile): void {
    const tiles = this.playersUsedTiles.get(playerId);
    if (!tiles) {
      throw new Error('Player not found at the table');
    }
    tiles.push(tile);
  }

  public playerAction(
    playerId: string,
    actionEntry: PlayerActionTileEntry,
  ): void {
    const actionTiles = this.playersActionTiles.get(playerId);
    if (!actionTiles) {
      throw new Error('Player not found at the table');
    }
    actionTiles.push(actionEntry);
  }

  public removeTileFromPlayerUsedTiles(
    playerId: string,
    tile: MahjongTile,
  ): void {
    const usedTiles = this.playersUsedTiles.get(playerId);
    if (!usedTiles) {
      throw new Error('Player not found at the table');
    }
    const index = usedTiles.findIndex(
      (t) => t.type === tile.type && t.index === tile.index,
    );
    if (index === -1) {
      throw new Error("Tile not found in player's used tiles");
    }
    usedTiles.splice(index, 1);
  }
}
