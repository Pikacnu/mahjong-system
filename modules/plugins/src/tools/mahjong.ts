import { type MahjongTile, PlayerAction } from 'utils';

/**
 * Utility tools for Mahjong logic calculation.
 * These tools MUST remain synchronous.
 */

export const MahjongTools = {
  /**
   * Sorts tiles by type and then by index.
   */
  sortTiles(tiles: MahjongTile[]): MahjongTile[] {
    return [...tiles].sort((a, b) => {
      if (a.type !== b.type) return a.type - b.type;
      return a.index - b.index;
    });
  },
  /**
   * Creates a new tile instance.
   */
  createTile(type: number, index: number): MahjongTile {
    return { type, index };
  },
  /**
   * Creates a tile instance from a numeric ID.
   */
  fromNumericId(id: number): MahjongTile {
    const type = Math.floor(id / 100);
    const index = id % 100;
    return { type, index };
  },
  /**
   * Converts a tile to a numeric ID for easy comparison and storage.
   */
  toNumericId(tile: MahjongTile): number {
    return tile.type * 100 + tile.index;
  },
};
