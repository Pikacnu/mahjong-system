import { MahjongTileType, type MahjongTile } from 'utils';

export class Tile {
  private mahjongInfo: MahjongTile | null = null;

  constructor(info: MahjongTile) {
    this.mahjongInfo = info;
  }

  public static getTileFromInfo(info: MahjongTile): Tile {
    const tile = new Tile(info);
    return tile;
  }

  public static getTileFromTypeAndIndex(
    type: MahjongTileType,
    index: number,
  ): Tile {
    switch (type) {
      case MahjongTileType.Wind: {
        if (index < 0 || index > 3) {
          throw new Error('Invalid index for Wind or Dragon tile');
        }
        break;
      }
      case MahjongTileType.Dragon: {
        if (index < 0 || index > 2) {
          throw new Error('Invalid index for Wind or Dragon tile');
        }
        break;
      }
      case MahjongTileType.MAN:
      case MahjongTileType.PIN:
      case MahjongTileType.SOU: {
        if (index < 0 || index > 8) {
          throw new Error('Invalid index for MAN, PIN, or SOU tile');
        }
        break;
      }
    }
    return new Tile({ type, index: index as any });
  }

  public getInfo(): MahjongTile | null {
    return this.mahjongInfo;
  }

  public isEqualTo(other: Tile): boolean {
    const info1 = this.getInfo();
    const info2 = other.getInfo();
    if (info1 === null || info2 === null) {
      return false;
    }
    return info1.type === info2.type && info1.index === info2.index;
  }
}
