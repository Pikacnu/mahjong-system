import { Event } from 'proto/src/generated/services/room';
import {
  type HookType,
  MahjongGameRoundStatus,
  type GameMessagePayloads,
  type GameNextRequest,
  type GameNextResponse,
  type MahjongTile,
  encodeToBytes,
  GameMessageEnum,
} from 'utils';
import {
  PluginManager,
  type createRunnerGateway,
  type createStorageGateway,
} from '../type';

import { Player } from './player';
import { Table } from './table';
import { Round } from './round';
import { EventEmitter } from 'events';
import { Connection, connectionManager } from '@/classes/connectionManager';

export type GameEndCallbackData = {
  roundIndex?: number;
  isMatchEnd?: boolean;
  tilesRemaining?: number;
};

/**
 * Game is a higher-level container that owns a `Round` instance.
 * It delegates round-level operations to the current `Round` and exposes
 * convenience helpers for creating new rounds, delegating `next()` calls,
 * and centralizing a game-level end callback.
 */
export class Game {
  private currentRound: Round;
  private playerActionTimeLimit: number;
  private runnerGateway: ReturnType<typeof createRunnerGateway>;
  private storageGateway: ReturnType<typeof createStorageGateway>;
  private gameEndCallback: ((data: GameEndCallbackData) => void) | undefined;
  // Game owns the players and table so rounds can be restarted easily.
  private players: Map<string, Player> = new Map();
  private table: Table = new Table();
  private onRoundEnd: ((data: GameEndCallbackData) => void) | undefined;
  private onGameEnd: ((data: GameEndCallbackData) => void) | undefined;
  private pluginManager: PluginManager;
  private gameId: string | null = null;

  constructor({
    playerActionTimeLimit = 20_000,
    runnergRPCClient,
    storagegRPCClient,
    onRoundEnd,
    onGameEnd,
    gameEndCallback,
    roomId,
  }: {
    playerActionTimeLimit?: number;
    runnergRPCClient: ReturnType<typeof createRunnerGateway>;
    storagegRPCClient: ReturnType<typeof createStorageGateway>;
    roomId: string;
    onRoundEnd?: (data: GameEndCallbackData) => void;
    onGameEnd?: (data: GameEndCallbackData) => void;
    gameEndCallback?: (data: GameEndCallbackData) => void;
  }) {
    this.playerActionTimeLimit = playerActionTimeLimit;
    this.runnerGateway = runnergRPCClient;
    this.storageGateway = storagegRPCClient;
    this.onRoundEnd = onRoundEnd;
    this.onGameEnd = onGameEnd ?? gameEndCallback;
    this.gameEndCallback = gameEndCallback;
    this.gameId = roomId;

    // Initialize table & players container (empty by default)
    this.table = new Table();
    this.players = new Map();

    // Create plugin manager at game level so plugins can be shared across rounds
    this.pluginManager = new PluginManager(
      this.runnerGateway,
      this.storageGateway,
    );

    this.currentRound = new Round({
      playerActionTimeLimit: this.playerActionTimeLimit,
      pluginManager: this.pluginManager,
      roundEndCallback: (d: GameEndCallbackData) => {
        // First call game-level round-end hook
        this.onRoundEnd?.(d);
        // If plugin/round signals match end, call game-end hook
        if (
          d.isMatchEnd ||
          (typeof d.tilesRemaining === 'number' && d.tilesRemaining <= 0)
        ) {
          this.onGameEnd?.(d);
          // fallback to legacy callback if provided
          this.gameEndCallback?.(d);
        }
      },
      players: this.players,
      table: this.table,
      gameClass: this,
    });
  }

  public getRound(): Round {
    return this.currentRound;
  }

  public createNewRound(options?: {
    resetTable?: boolean;
    resetPlayers?: boolean;
    preserveScores?: boolean;
  }): void {
    // Tear down current round and create a fresh one bound to the same gateways.
    try {
      this.currentRound.cleanup();
    } catch (err) {
      // ignore cleanup errors
    }

    const opts = {
      resetTable: false,
      resetPlayers: false,
      preserveScores: true,
      ...(options || {}),
    };

    if (opts.resetPlayers) {
      // Recreate player instances but optionally preserve scores
      const preservedScores = new Map<string, number>();
      if (opts.preserveScores) {
        for (const [pid, p] of this.players.entries())
          preservedScores.set(pid, p.getScore());
      }
      const newPlayers = new Map<string, Player>();
      for (const pid of this.players.keys()) {
        const np = new Player();
        if (opts.preserveScores) np.setScore(preservedScores.get(pid) ?? 0);
        newPlayers.set(pid, np);
      }
      this.players = newPlayers;
    }

    if (opts.resetTable) {
      this.table = new Table();
    }

    // Ensure table contains all players
    for (const pid of this.players.keys()) {
      try {
        this.table.addPlayer(pid);
      } catch (err) {
        // ignore if already present
      }
    }

    this.currentRound = new Round({
      playerActionTimeLimit: this.playerActionTimeLimit,
      pluginManager: this.pluginManager,
      roundEndCallback: (d: GameEndCallbackData) => {
        this.onRoundEnd?.(d);
        if (
          d.isMatchEnd ||
          (typeof d.tilesRemaining === 'number' && d.tilesRemaining <= 0)
        ) {
          this.onGameEnd?.(d);
          this.gameEndCallback?.(d);
        }
      },
      players: this.players,
      table: this.table,
      gameClass: this,
    });
  }

  // Plugin management helpers (delegates to game-level PluginManager)
  public async addPlugin<StorageType>(plugin: any, priority = 0) {
    return this.pluginManager.addPlugin(plugin as any, priority);
  }

  public async removePlugin(pluginId: string) {
    return this.pluginManager.removePlugin(pluginId);
  }

  public async runPluginHook<StorageType, HookName extends HookType>(
    args: Parameters<PluginManager['runHook']>[0],
  ) {
    return this.pluginManager.runHook(args as any);
  }

  /**
   * Replace the players Map used by this Game. Useful when loading saved
   * player objects or swapping implementations. Must be called before a
   * round starts (i.e., when round status is `RoundStart`).
   */
  public setPlayers(players: Map<string, Player>): void {
    if (
      this.currentRound &&
      this.currentRound.getStatus() !== MahjongGameRoundStatus.RoundStart
    ) {
      throw new Error('Cannot replace players after round started');
    }
    this.players = players;
    // ensure table contains entries for players
    for (const pid of this.players.keys()) {
      try {
        this.table.addPlayer(pid);
      } catch (err) {
        // ignore if already present
      }
    }
  }

  private connection: Connection | null =
    connectionManager.createRoomConnection(this.gameId!);

  public sendEventToPlayer<T extends keyof GameMessagePayloads>(
    playerId: string,
    event: T,
    payload: GameMessagePayloads[T],
  ): void {
    const message = {
      event,
      payload,
    } as any;
    this.connection?.sendEvent({
      playerId,
      gameId: this.gameId!,
      event: RoundEventToEventMap[event],
      payload: encodeToBytes(message),
    });
  }

  public broadcastEvent<T extends keyof GameMessagePayloads>(
    event: T,
    payload: GameMessagePayloads[T],
  ): void {
    const message = {
      event,
      payload,
    } as any;
    const bytes = encodeToBytes(message) as Buffer;
    connectionManager.broadcastToRoom(this.gameId!, {
      event: RoundEventToEventMap[event],
      playerId: -1,
      payload: bytes,
      gameId: Number(this.gameId),
    });
  }

  /**
   * Replace the Table instance used by this Game. Must be called before a
   * round starts.
   */
  public setTable(table: Table): void {
    if (
      this.currentRound &&
      this.currentRound.getStatus() !== MahjongGameRoundStatus.RoundStart
    ) {
      throw new Error('Cannot replace table after round started');
    }
    this.table = table;
  }

  public addPlayer(playerId: string): void {
    if (this.players.has(playerId)) {
      throw new Error('Player already exists');
    }
    // Disallow adding players once the current round has started
    if (
      this.currentRound &&
      this.currentRound.getStatus() !== MahjongGameRoundStatus.RoundStart
    ) {
      throw new Error('Cannot add player after round started');
    }
    const p = new Player();
    this.players.set(playerId, p);
    this.table.addPlayer(playerId);
  }

  public removePlayer(playerId: string): void {
    if (!this.players.has(playerId)) {
      throw new Error('Player not found');
    }
    if (
      this.currentRound &&
      this.currentRound.getStatus() !== MahjongGameRoundStatus.RoundStart
    ) {
      throw new Error('Cannot remove player after round started');
    }
    this.players.delete(playerId);
    this.table.removePlayer(playerId);
  }

  public async next(req: GameNextRequest): Promise<GameNextResponse> {
    return this.currentRound.next(req);
  }

  public reslovedPlayerAction(playerId: string, payload: unknown): void {
    try {
      this.currentRound.next({
        requestId: this.currentRound['currentRequestId'],
        args: {
          playerId,
          payload,
        },
      });
    } catch (error) {
      console.error('Error resolving player action:', error);
    }
  }

  public processedReceivedRoomAction(event: Event, payload: any): void {
    switch (event) {
      case Event.GAME_START: {
        this.currentRound.next({
          requestId: (this.currentRound as any).currentRequestId,
        });
        break;
      }
      case Event.PLAYER_JOINED: {
        if (
          this.currentRound.getStatus() !== MahjongGameRoundStatus.RoundStart
        ) {
          console.warn('Player joined after round started, ignoring:', payload);
          break;
        }
        this.table.addPlayer(payload.playerId);
        break;
      }
      case Event.PLAYER_LEFT: {
        if (
          this.currentRound.getStatus() !== MahjongGameRoundStatus.RoundStart
        ) {
          console.warn('Player left after round started, ignoring:', payload);
          break;
        }
        this.table.removePlayer(payload.playerId);
        break;
      }
      default: {
        try {
          this.currentRound.next({
            requestId: this.currentRound['currentRequestId'],
            args: {
              playerId: payload.playerId,
              payload,
            },
          });
        } catch (error) {
          console.error('Error processing room action:', error);
        }
      }
    }
  }

  public setCurrentDrawnTile(tile: MahjongTile): void {
    this.currentRound.setCurrentDrawnTile(tile);
  }

  public cleanup(): void {
    this.currentRound.cleanup();
    // Clear game-owned resources
    this.players.clear();
    this.table = new Table();
  }
}

const RoundEventToEventMap: Record<keyof GameMessagePayloads, Event> = {
  [GameMessageEnum.PlayerGetsTile]: Event.PLAYER_GETS_TILE,
  [GameMessageEnum.PlayerDrawsTile]: Event.PLAYER_DRAWS_TILE,
  [GameMessageEnum.PlayerDiscardsTile]: Event.PLAYER_DISCARDS_TILE,
  [GameMessageEnum.RoundStart]: Event.ROUND_START,
  [GameMessageEnum.RoundEnd]: Event.ROUND_END,
  [GameMessageEnum.PlayerChi]: Event.PLAYER_CHI,
  [GameMessageEnum.PlayerPon]: Event.PLAYER_PON,
  [GameMessageEnum.PlayerKan]: Event.PLAYER_KAN,
  [GameMessageEnum.PlayerRon]: Event.PLAYER_RON,
  [GameMessageEnum.PlayerTsumo]: Event.PLAYER_TSUMO,
  [GameMessageEnum.PlayerRiichi]: Event.PLAYER_RIICHI,
  [GameMessageEnum.ShowActions]: Event.SHOW_ACTIONS,
  [GameMessageEnum.ShowAvailableActions]: Event.SHOW_AVAILABLE_ACTIONS,
  [GameMessageEnum.ShowHint]: Event.SHOW_HINT,
  [GameMessageEnum.ShowError]: Event.SHOW_ERROR,
  [GameMessageEnum.ShowInfo]: Event.SHOW_INFO,
  [GameMessageEnum.GameStart]: Event.GAME_START,
  [GameMessageEnum.GameEnd]: Event.GAME_END,
  [GameMessageEnum.ChangePlayerHand]: Event.CHANGE_PLAYER_HAND,
  [GameMessageEnum.RoundStatusChanged]: Event.ROUND_STATUS_CHANGED,
};

const EventToRoundEventMap: Record<Event, keyof GameMessagePayloads> =
  Object.fromEntries(
    Object.entries(RoundEventToEventMap).map(([k, v]) => [v, k]),
  ) as unknown as Record<Event, keyof GameMessagePayloads>;

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

/**
 * 回合執行 :
 * 1. 確認當前玩家可接受的役種 (返回符合役種的剩餘牌)
 * 2. 確認振聽
 * 3. 確認狀態
 * 4. 給予牌
 * 5. 確認行動 (自摸)
 * 6. 發送行動
 * 7. 等待行動
 * 8. 第一次結算行動
 * 9. 檢查其他玩家行為
 * 10, 發送行動
 * 11. 等待行動
 * 12. 第二次結算行動
 * 13. 結束回合
 */
