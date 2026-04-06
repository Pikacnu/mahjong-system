import { randomUUIDv7 } from 'bun';
import {
  type DrawTile,
  type GameNextRequest,
  type GameNextResponse,
  type Log,
  MahjongGameRoundStatus,
  MahjongGameStatus,
  type MahjongTile,
  MahjongTileType,
  PlayerAction,
  type PlayerActionTileEntry,
  PlayerActionType,
  TimeoutAction,
  type TimeoutActionEvent,
} from '../mahjong/type';
import { shuffleArray } from '../utils';
import z from 'zod';

export class Game {
  private roundStatus: MahjongGameRoundStatus =
    MahjongGameRoundStatus.RoundStart;
  private table: Table = new Table();
  private players: Map<string, Player> = new Map();
  private playerIdForTurnOrder: Array<string> = [];
  private currentPlayerIndex: number = 0;
  private playerActionTimeLimit: number = 20_000; // 20 seconds
  private timeoutHandle: NodeJS.Timeout | null = null;

  // Next Request ID to ensure the correct sequence of game actions and
  // prevent out-of-order execution
  private currentRequestId = randomUUIDv7();

  // Player Action Handle Properties:
  private currentDrawTile: MahjongTile | null = null;
  private pendingPlayerActions: Map<string, PlayerAction[]> = new Map();
  private pendingPlayerDefaultActions: Map<string, TimeoutActionEvent> =
    new Map();
  private resolvedPlayerActions: Map<string, PlayerAction | null> = new Map();

  constructor({
    playerActionTimeLimit = 20_000,
  }: {
    playerActionTimeLimit?: number;
  }) {
    this.playerActionTimeLimit = playerActionTimeLimit;
  }

  public addPlayer(playerId: string): void {
    if (this.roundStatus !== MahjongGameRoundStatus.RoundStart) {
      throw new Error('Cannot add player after the game has started');
    }
    if (this.players.has(playerId)) {
      throw new Error('Player already exists in the game');
    }
    this.players.set(playerId, new Player());
    this.table.addPlayer(playerId);
  }

  public removePlayer(playerId: string): void {
    if (!this.players.has(playerId)) {
      throw new Error('Player not found in the game');
    }
    this.players.delete(playerId);
    this.table.removePlayer(playerId);
  }

  private handleRoundStart(): void {
    if (this.roundStatus !== MahjongGameRoundStatus.RoundStart) {
      throw new Error('Round has already started');
    }
    if (this.players.size === 0) {
      throw new Error('Cannot start round with zero players');
    }
    this.playerIdForTurnOrder = shuffleArray(Array.from(this.players.keys()));
    this.currentPlayerIndex = 0;
    this.roundStatus = MahjongGameRoundStatus.PlayerGetsTile;
    this.next({ requestId: this.currentRequestId });
  }

  private handlePlayerGetsTile(): void {
    const currentPlayerId = this.getCurrentPlayerId();
    const tile = this.table.removeTileByIndex(0);
    this.table.addPlayerDrawedTile(currentPlayerId, tile);
    // Check if player can do any action before drawing tile (e.g., Ron, Tsumo)
    // 第3項設計：這裡只負責建立待處理狀態；真正的玩家回覆由遊戲伺服器
    // 收到後，再透過 gRPC / next(...) 回呼進來推進狀態，Game 不主動輪詢玩家輸入。

    const actions = this.checkPlayerActionType(this.getCurrentPlayer(), tile);
    if (actions.includes(PlayerAction.Tsumo)) {
      this.pendingPlayerActions.set(currentPlayerId, [PlayerAction.Tsumo]);
      this.pendingPlayerDefaultActions.set(currentPlayerId, {
        action: TimeoutAction.Skip,
      });

      this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
      this.createTimeoutHandle(this.playerActionTimeLimit);
      this.next({ requestId: this.currentRequestId });
      return;
    }
    this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
    this.next({ requestId: this.currentRequestId });
  }

  private handleTimeoutAction(): void {
    const didntRespondedPlayerIds = Array.from(
      this.pendingPlayerActions.keys(),
    ).filter((playerId) => !this.resolvedPlayerActions.has(playerId));
    didntRespondedPlayerIds.forEach((playerId) => {
      const defaultAction = this.pendingPlayerDefaultActions.get(playerId);
      switch (defaultAction?.action) {
        case TimeoutAction.Skip: {
          // 逾時後不執行額外動作，保留現況並交由外部流程決定是否進入下一個事件。
          break;
        }
        case TimeoutAction.DrawTile: {
          const currentPlayer = this.getCurrentPlayer();
          // 補抽時應依 payload 指定的 index 或 tile 取回玩家牌，再同步到桌面與手牌狀態。
          const tile =
            defaultAction.payload && 'tile' in defaultAction.payload
              ? currentPlayer.removeHandTile(defaultAction.payload.tile)
              : currentPlayer.removeHandTileByIndex(
                  defaultAction.payload && 'index' in defaultAction.payload
                    ? defaultAction.payload.index
                    : currentPlayer.getHandTiles().length - 1,
                );
          this.table.addPlayerDrawedTile(this.getCurrentPlayerId(), tile);
          break;
        }
        default: {
          throw new Error('Invalid timeout action');
        }
      }
    });
  }

  // private handleWaitingForPlayerDrawTile(currentDrawTile: MahjongTile): void {
  //   // 這裡應負責掃描所有玩家是否具備可反應動作，並把結果整理成待送給伺服器的行動清單。
  //   this.players.forEach((player) =>
  //     this.checkPlayerActionType(player, this.currentDrawTile!),
  //   );

  //   this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
  //   this.lastPlayerActionTimeStamp = Date.now();
  //   this.currentDrawTile = currentDrawTile;
  //   this.next({ requestId: this.currentRequestId });
  // }

  private checkPlayerActionType(
    player: Player = this.getCurrentPlayer(),
    currentDrawTile: MahjongTile,
  ): PlayerAction[] {
    // 這裡應檢查當前摸到的牌是否構成胡牌、吃、碰、槓等合法行動；之後可再拆成獨立規則模組。
    return [];
  }

  private createTimeoutHandle(
    timeout: number,
    ...args: Parameters<typeof this.handleTimeoutAction>
  ): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.timeoutHandle = setTimeout(
      this.handleTimeoutAction.bind(this, ...args),
      timeout,
    );
  }

  private handleResolvingPlayerAction({
    action,
    playerId,
  }: z.infer<typeof PlayerActionType>): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    const allowedActions = this.pendingPlayerActions.get(playerId);
    if (!allowedActions || !allowedActions.includes(action)) {
      throw new Error('Invalid player action');
    }
    this.resolvedPlayerActions.set(playerId, action);

    // Check if all player have resolved their action
    const allResolved = Array.from(this.pendingPlayerActions.keys()).every(
      (id) => this.resolvedPlayerActions.has(id),
    );
    if (!allResolved) {
      // 只要仍有玩家未回覆，就維持等待狀態，直到外部再送入下一個回應或 timeout。
      return;
    }
    for (const [id, action] of this.resolvedPlayerActions.entries()) {
      switch (action) {
        case PlayerAction.Tsumo: {
          // 自摸時應立即鎖定和牌結果、記錄來源與牌型，並推進到結算流程。
          break;
        }
        case PlayerAction.DiscardTile: {
          const drawedTile = this.currentDrawTile;
          if (!drawedTile) {
            throw new Error('No tile to discard');
          }
          // 出牌時應把摸到的牌從手牌移除，寫入棄牌區，並切換到下一位玩家的反應流程。
          break;
        }
        case PlayerAction.Ron: {
          // 榮和時應鎖定放槍者、紀錄和牌來源，並終止後續吃碰槓判定。
          break;
        }
        case PlayerAction.Chi: {
          // 吃牌時應驗證是否為合法下家反應，並扣除對應牌組後要求玩家補打一張牌。
          break;
        }
        case PlayerAction.Pon: {
          // 碰牌時應驗證三張同牌成立，更新副露與手牌，並切回出牌要求。
          break;
        }
        case PlayerAction.Kan: {
          // 槓牌時應依明槓、暗槓、加槓的型態處理，並進入補牌或結算分支。
          break;
        }

        default: {
          // this should never happen since we only set allowed action to player
          throw new Error('Invalid resolved player action');
          break;
        }
      }
    }
  }

  private handleRoundEnd(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Reset Player Action Handle Properties
    this.pendingPlayerActions.clear();
    this.pendingPlayerDefaultActions.clear();
    this.resolvedPlayerActions.clear();
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.playerIdForTurnOrder.length;

    if (this.table.getTilesCount() !== 0) {
      // 回合未結束時，這裡應執行結算前準備，例如計分、整理流局原因與初始化下一局狀態。
      this.roundStatus = MahjongGameRoundStatus.RoundStart;
      this.next({ requestId: this.currentRequestId });
    }
    // 若牌堆已空，這裡應結束整局遊戲並通知外部系統進入最終結算或結果顯示。
  }

  public next({ requestId, args }: GameNextRequest): GameNextResponse {
    if (requestId !== this.currentRequestId) {
      throw new Error('Invalid request ID');
    }

    let response: GameNextResponse | null;
    switch (this.roundStatus) {
      case MahjongGameRoundStatus.RoundStart: {
        this.handleRoundStart();
        this.currentDrawTile = null;
        break;
      }
      case MahjongGameRoundStatus.PlayerGetsTile: {
        this.handlePlayerGetsTile();
        break;
      }

      case MahjongGameRoundStatus.WaitingForPlayerAction: {
        // 這個狀態不主動推進；它只等待外部伺服器在收到玩家回覆後，再帶著 args 呼叫 next。
        break;
      }
      case MahjongGameRoundStatus.ResolvingPlayerAction: {
        const isVaildType = PlayerActionType.safeParse(args);
        if (!isVaildType.success) {
          throw new Error('Invalid player action type');
        }
        this.handleResolvingPlayerAction(isVaildType.data);
        break;
      }
      case MahjongGameRoundStatus.RoundEnd: {
        this.handleRoundEnd();
        break;
      }
      default: {
        throw new Error('Invalid round status');
      }
    }
    this.currentRequestId = randomUUIDv7();
    return { requestId: this.currentRequestId };
  }

  public setCurrentDrawedTile(tile: MahjongTile): void {
    this.currentDrawTile = tile;
  }

  public getCurrentPlayerId(): string {
    return this.playerIdForTurnOrder[this.currentPlayerIndex]!;
  }

  public getCurrentPlayer(): Player {
    const playerId = this.getCurrentPlayerId();
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Current player not found');
    }
    return player;
  }

  public getPlayerById(playerId: string): Player {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    return player;
  }
}

export class Player {
  private handTiles: Array<DrawTile<MahjongTile>> = [];
  private usedTiles: Set<number> = new Set();

  public getHandTiles(): Array<MahjongTile> {
    return this.handTiles.map((tile) => ({ ...tile }));
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

  public getUsedTiles(): Set<number> {
    return this.usedTiles;
  }

  public playerAction(actionEntry: PlayerActionTileEntry): void {}
}
/*
當回合開始時:
Status: PlayerGetsTile
執行:
1. (這裡應該會被呼叫 addHandTile(tile) 加入玩家抓的牌)
2. 修改狀態 -> 等待玩家出牌

當玩家出牌時:
Status: WaitingForPlayerAction
執行:
1. discardHandTile(tile) 從玩家手牌移除玩家出的牌
2. (交由 Game Class 判斷其他玩家是否要吃碰槓胡)

當玩家吃碰槓胡時:
Status: WaitingForPlayerAction
執行:
1. 我不知道 ...
2. removeHandTile(tile) 從玩家手牌移除吃碰槓胡的牌
*/

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

/*
遊戲開始時:
Status: RoundStart
執行:
1. addTiles(tiles) 洗牌後加入牌堆
2. addPlayer(playerId) 加入玩家
3. shuffleTiles() 洗牌
4. getTileByIndex(index) 抓取裏寶牌
5. removeTileByIndex(index) 從牌堆移除裏寶牌
6. addUraDoraTile(tile) 加入裏寶牌
7. addRedDoraTile(tile) 加入紅寶牌
8. openUraDoraTile(index) 開啟裏寶牌 (index)
9. removeRedDoraTile(tile) 移除多餘牌

回合開始時:
Status: PlayerGetsTile
執行:
1. removeTileByIndex(index) 從牌堆移除玩家抓的牌 (同時獲取牌面資訊)
2. addPlayerDrawedTile(playerId, tile) 加入玩家抓的牌
3. (遊戲 Class 條件判斷 玩家狀態是否要進入下一個狀態)

回合結束時:
Status: RoundEnd
執行:
1. (遊戲 Class 條件判斷 玩家狀態是否要進入下一個狀態)

當玩家吃:
Status: WaitingForPlayerAction
執行:
1. playerAction(playerId, { action: PlayerAction.Chi, tiles: [tile1, tile2, tile3] }) 玩家吃牌
2. 找到執行玩家 ID
3. removeTileFromPlayerUsedTiles(playerId, tile1) 從玩家已使用牌中移除 tile1

當玩家碰:
Status: WaitingForPlayerAction
執行:
1. playerAction(playerId, { action: PlayerAction.Pon, tiles: [tile1, tile2, tile3] }) 玩家碰牌
2. 找到執行玩家 ID
3. removeTileFromPlayerUsedTiles(playerId, tile1) 從玩家已使用牌中移除 tile1
4. 從玩家手牌移除其他兩張 tile
5. (Class 要提醒玩家在出一張牌)
6. 結束後玩家狀態回到等待玩家出牌

當玩家槓:
Status: WaitingForPlayerAction
執行:
1. playerAction(playerId, { action: PlayerAction.Kan, tiles: [tile1, tile2, tile3, tile4] }) 玩家槓牌
2. 找到執行玩家 ID
3. removeTileFromPlayerUsedTiles(playerId, tile1) 從玩家已使用牌中移除 tile1
4. 從玩家手牌移除其他三張 tile

當玩家胡:
Status: WaitingForPlayerAction
執行:
1. 先由 Game 驗證胡牌條件，再鎖定本局結果並進入結算流程。
*/
