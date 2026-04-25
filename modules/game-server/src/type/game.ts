import { randomUUIDv7 } from 'bun';
import {
  ActionHookType,
  type GameNextRequest,
  type GameNextResponse,
  type GameStatsPatch,
  GameStatusPatches,
  type HookType,
  LifecycleHookType,
  MahjongGameRoundStatus,
  type MahjongTile,
  PlayerAction,
  PlayerActionType,
  PlayerStatusPatches,
  type PluginHookPayloads,
  type PluginHookResult,
  TimeoutAction,
  type TimeoutActionEvent,
  type WithPluginId,
} from 'utils';
import { shuffleArray } from 'utils';
import z from 'zod';
import { Table } from './table';
import {
  createRunnerGateway,
  createStorageGateway,
  PluginManager,
} from '../type';
import { Player } from './player';
import type { ActionSharedData, ActionSharedDataPlayersData } from './utils';

export type GameEndCallbackData = {};
/**
 *
 * Todo:
 * 1. Game End Logic
 * 2. Player Action Logic
 * 3. Score Calculation Logic
 */

export class Game {
  private roundStatus: MahjongGameRoundStatus =
    MahjongGameRoundStatus.RoundStart;
  private table: Table = new Table();
  private players: Map<string, Player> = new Map();
  private playerIdForTurnOrder: Array<string> = [];
  private currentPlayerIndex: number = 0;
  private playerActionTimeLimit: number = 20_000;
  private timeoutHandle: NodeJS.Timeout | null = null;

  private modulePluginManager: PluginManager | null = null;

  private roundIndex = 0;
  private pluginStateStorage: Map<string, unknown> = new Map();

  private currentRequestId = randomUUIDv7();

  // Player Action Handle Properties:
  private currentDrawTile: MahjongTile | null = null;
  private pendingPlayerActions: Map<string, PlayerAction[]> = new Map();
  private pendingPlayerDefaultActions: Map<string, TimeoutActionEvent> =
    new Map();
  private resolvedPlayerActions: Map<string, PlayerAction | null> = new Map();
  private gameEndCallback: ((data: GameEndCallbackData) => void) | undefined;
  private isGameEnded = false;

  constructor({
    playerActionTimeLimit = 20_000,
    runnergRPCClient,
    storagegRPCClient,
    gameEndCallback,
  }: {
    playerActionTimeLimit?: number;
    runnergRPCClient: ReturnType<typeof createRunnerGateway>;
    storagegRPCClient: ReturnType<typeof createStorageGateway>;
    gameEndCallback: (data: GameEndCallbackData) => void;
  }) {
    this.playerActionTimeLimit = playerActionTimeLimit;
    this.modulePluginManager = new PluginManager(
      runnergRPCClient,
      storagegRPCClient,
    );
    this.gameEndCallback = gameEndCallback;
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

  private async handleRoundStart(): Promise<void> {
    if (this.roundStatus !== MahjongGameRoundStatus.RoundStart) {
      throw new Error('Round has already started');
    }
    if (this.players.size === 0) {
      throw new Error('Cannot start round with zero players');
    }
    this.playerIdForTurnOrder = shuffleArray(Array.from(this.players.keys()));
    this.currentPlayerIndex = 0;
    this.roundStatus = MahjongGameRoundStatus.PlayerGetsTile;
    await this.runHook({
      hook: LifecycleHookType.RoundStart,
      requestId: this.currentRequestId,
      payload: {
        roundIndex: this.roundIndex,
      },
    });
    await this.next({ requestId: this.currentRequestId });
  }

  private async handlePlayerGetsTile(): Promise<void> {
    const currentPlayerId = this.getCurrentPlayerId();
    const tile = this.table.removeTileByIndex(0);
    this.table.addPlayerDrawedTile(currentPlayerId, tile);

    // Check if player can do any action before drawing tile (e.g., Ron, Tsumo)

    await this.runHook({
      hook: ActionHookType.EvaluateAvailableActions,
      requestId: this.currentRequestId,
      payload: {
        playerId: currentPlayerId,
        tiles: this.getCurrentPlayer().getHandTiles(),
      },
    });

    const actions = this.checkPlayerActionType(this.getCurrentPlayer(), tile);

    if (actions.includes(PlayerAction.Tsumo)) {
      this.pendingPlayerActions.set(currentPlayerId, [PlayerAction.Tsumo]);
      this.pendingPlayerDefaultActions.set(currentPlayerId, {
        action: TimeoutAction.Skip,
      });

      this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
      this.createTimeoutHandle(this.playerActionTimeLimit);
      await this.next({ requestId: this.currentRequestId });
      return;
    }

    this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
    await this.next({ requestId: this.currentRequestId });
  }

  private async handleTimeoutAction(): Promise<void> {
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
    currentDrawTile: MahjongTile | null,
  ): PlayerAction[] {
    this.runHook({
      hook: ActionHookType.EvaluateAvailableActions,
      requestId: this.currentRequestId,
      payload: {
        playerId: this.getCurrentPlayerId(),
        tiles: currentDrawTile
          ? [...player.getHandTiles(), currentDrawTile]
          : player.getHandTiles(),
      },
    });
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

  private async handleResolvingPlayerAction({
    action,
    playerId,
  }: z.infer<typeof PlayerActionType>): Promise<void> {
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
      // if not all player have resolved their action, wait for next player action response or timeout
      return;
    }
    for (const [id, action] of this.resolvedPlayerActions.entries()) {
      switch (action) {
        case PlayerAction.Tsumo: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Tsumo,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          // 自摸時應立即鎖定和牌結果、記錄來源與牌型，並推進到結算流程。
          break;
        }
        case PlayerAction.DrawTile: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.DrawTile,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          break;
        }
        case PlayerAction.Ron: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Ron,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          // 榮和時應鎖定放槍者、紀錄和牌來源，並終止後續吃碰槓判定。
          break;
        }
        case PlayerAction.Chi: {
          this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Chi,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          // 吃牌時應驗證是否為合法下家反應，並扣除對應牌組後要求玩家補打一張牌。
          break;
        }
        case PlayerAction.Pon: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Pon,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          // 碰牌時應驗證三張同牌成立，更新副露與手牌，並切回出牌要求。
          break;
        }
        case PlayerAction.Kan: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Kan,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          // 槓牌時應依明槓、暗槓、加槓的型態處理，並進入補牌或結算分支。
          break;
        }
        case PlayerAction.Riichi: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Riichi,
              playerId: id,
              tiles: this.getCurrentPlayer().getHandTiles(),
            },
          });
          break;
        }
        default: {
          // this should never happen since we only set allowed action to player
          throw new Error('Invalid resolved player action');
        }
      }
    }
  }

  private async handleRoundEnd(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    await this.modulePluginManager?.runHook({
      hook: LifecycleHookType.RoundEnd,
      requestId: this.currentRequestId,
      payload: {
        roundIndex: this.roundIndex,
      },
    });

    // Reset Player Action Handle Properties
    this.pendingPlayerActions.clear();
    this.pendingPlayerDefaultActions.clear();
    this.resolvedPlayerActions.clear();
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.playerIdForTurnOrder.length;

    // Increase round index
    this.roundIndex += 1;
    if (this.table.getTilesCount() !== 0) {
      // 回合未結束時，這裡應執行結算前準備，例如計分、整理流局原因與初始化下一局狀態。
      this.roundStatus = MahjongGameRoundStatus.RoundStart;
      this.next({ requestId: this.currentRequestId });
    }
    // 若牌堆已空，這裡應結束整局遊戲並通知外部系統進入最終結算或結果顯示。

    if (this.isGameEnded) {
      this.gameEndCallback!({});
    }
  }

  public async next({
    requestId,
    args,
  }: GameNextRequest): Promise<GameNextResponse> {
    if (requestId !== this.currentRequestId) {
      throw new Error('Invalid request ID');
    }

    let response: GameNextResponse | null;
    switch (this.roundStatus) {
      case MahjongGameRoundStatus.RoundStart: {
        await this.handleRoundStart();
        this.currentDrawTile = null;
        break;
      }

      case MahjongGameRoundStatus.PlayerGetsTile: {
        await this.handlePlayerGetsTile();
        break;
      }

      case MahjongGameRoundStatus.WaitingForPlayerAction: {
        break;
      }
      case MahjongGameRoundStatus.ResolvingPlayerAction: {
        const isVaildType = PlayerActionType.safeParse(args);
        if (!isVaildType.success) {
          throw new Error('Invalid player action type');
        }
        await this.handleResolvingPlayerAction(isVaildType.data);
        break;
      }
      case MahjongGameRoundStatus.RoundEnd: {
        await this.handleRoundEnd();
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

  private async buildCurrentPluginRunnerSharedData(): Promise<
    Omit<ActionSharedData, 'isCurrentPlayer'>
  > {
    return {
      currentPlayerId: this.getCurrentPlayerId(),
      PlayersData: Array.from(this.players.entries()).map(
        ([playerId, player]) => ({
          playerId,
          handCount: player.getHandTiles().length,
          openedTiles: player.getActionLogs(),
          isRiichi: false,
        }),
      ),
      roundIndex: this.roundIndex,
      doraIndicators: this.table.getRedDoraTiles(),
      currentDiscard: this.table
        .getPlayerUsedTiles(this.getCurrentPlayerId())
        .slice(-1)[0],
      isFirstTurn: this.roundIndex === 0,
    };
  }

  private patchesReslover(patches: GameStatsPatch[]): void {
    for (const patch of patches) {
      switch (patch.patchType) {
        case PlayerStatusPatches.PlayerScores: {
          const { playerId, delta } = patch.data;
          const player = this.players.get(playerId);
          if (!player) {
            console.warn('Player not found for score patch:', playerId);
            break;
          }
          player.setScore(player.getScore() + delta);
          break;
        }
        case PlayerStatusPatches.PlayerHandTile: {
          const { playerId, handTile, replaceTile } = patch.data;
          const player = this.players.get(playerId);
          if (!player) {
            console.warn('Player not found for hand tiles patch:', playerId);
            break;
          }
          if (replaceTile) {
            player.removeHandTile(replaceTile);
          }
          player.addHandTile(handTile);
          break;
        }
        case PlayerStatusPatches.PlayerHandTiles: {
          const { playerId, handTiles } = patch.data;
          const player = this.players.get(playerId);
          if (!player) {
            console.warn('Player not found for hand tiles patch:', playerId);
            break;
          }
          player.replaceHandTiles(handTiles);
          break;
        }
        // Game Status Patches
        // WIP
        case GameStatusPatches.GameStats: {
          break;
        }
        // Handle different patch types
        default: {
          console.warn('Unknown patch type:', patch);
        }
      }
    }
  }

  private async CalcScore(): Promise<void> {
    const sharedData = await this.buildCurrentPluginRunnerSharedData();
  }

  private async runHook<HookName extends HookType>(data: {
    hook: HookName;
    requestId: string;
    payload: PluginHookPayloads[HookName];
    playerId?: string;
    roundIndex?: number;
  }): Promise<
    | {
        accepted: false;
      }
    | {
        accepted: true;
      }
  > {
    // hookResult already sorted by plugin priority
    const hookResult = await this.modulePluginManager?.runHook(data)!;
    const notAcceptedResult = hookResult.find((result) => result.reject);
    if (notAcceptedResult) {
      return { accepted: false };
    }
    const gameStatusPatches = hookResult
      .filter(
        (result): result is WithPluginId<PluginHookResult<unknown>> =>
          'gameStatsPatch' in result,
      )
      .flatMap((result) => result.gameStatsPatch || []);
    this.patchesReslover(gameStatusPatches);
    // 這裡應該把 gameStatusPatches 傳給外部系統，讓它決定是否要更新遊戲狀態或進行其他處理。
    return { accepted: true };
  }

  public cleanup() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.players.clear();
    this.table = null as unknown as Table;
    this.playerIdForTurnOrder = [];
    this.currentPlayerIndex = 0;
    this.currentDrawTile = null;
    this.pendingPlayerActions.clear();
    this.pendingPlayerDefaultActions.clear();
    this.resolvedPlayerActions.clear();
    this.pluginStateStorage.clear();
  }
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
