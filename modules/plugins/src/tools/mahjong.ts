export const TileSuitNumberToString = {
  0: 'm',
  1: 'p',
  2: 's',
  3: 'z',
};

export class MahjongTile {
  public suit: number = 0;
  public id: number = 0;

  constructor(suit: number, id: number) {
    this.suit = suit;
    this.id = id;
  }

  public toNumber(): number {
    return this.suit * 100 + this.id;
  }

  public static getMahjongfromNumber(mahjongDef: number): MahjongTile {
    const suit = Math.floor(mahjongDef / 100);
    const id = mahjongDef % 100;
    return new MahjongTile(suit, id);
  }

  public isEqual(other: MahjongTile): boolean {
    return this.suit === other.suit && this.id === other.id;
  }

  public toString(): string {
    return `${this.id}${TileSuitNumberToString[this.suit as keyof typeof TileSuitNumberToString]}`;
  }
}
