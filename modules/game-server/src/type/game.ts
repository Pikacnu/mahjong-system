import { randomUUIDv7 } from 'bun';
import {
  ActionHookType,
  GameMessageEnum,
  type GameMessagePayloads,
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

// Plugin hook result schema (defensive parsing for unknown plugin returns)
const PluginHookResultItem = z.object({
  reject: z.boolean().optional(),
  pluginAction: z.array(z.number()).optional(),
  gameStatsPatch: z.array(z.any()).optional(),
});
import { Table } from './table';
import {
  createRunnerGateway,
  createStorageGateway,
  PluginManager,
} from '../type';
import { Player } from './player';
import type { ActionSharedData, ActionSharedDataPlayersData } from './utils';

export type GameEndCallbackData = {
  roundIndex?: number;
  isMatchEnd?: boolean;
  tilesRemaining?: number;
};
/**
 *
 * Todo:
 * 1. Game End Logic
 * 2. Player Action Logic
 * 3. Score Calculation Logic
 */

export class Round {
  private roundStatus: MahjongGameRoundStatus =
    MahjongGameRoundStatus.RoundStart;
  private table: Table;
  private players: Map<string, Player>;
  private playerIdForTurnOrder: Array<string> = [];
  private currentPlayerIndex: number = 0;
  private playerActionTimeLimit: number = 20_000;
  private timeoutHandle: NodeJS.Timeout | null = null;
  // Processing depth counter to avoid concurrent processing (supports nested internal calls)
  private processingDepth: number = 0;

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
  private roundEndCallback: ((data: GameEndCallbackData) => void) | undefined;
  private isRoundEnded = false;

  private currentWind: number = 0; // 0: East, 1: South, 2: West, 3: North

  constructor({
    playerActionTimeLimit = 20_000,
    roundEndCallback,
    players,
    table,
    pluginManager,
  }: {
    playerActionTimeLimit?: number;
    pluginManager?: PluginManager;
    roundEndCallback: (data: GameEndCallbackData) => void;
    players?: Map<string, Player>;
    table?: Table;
  }) {
    this.playerActionTimeLimit = playerActionTimeLimit;
    this.modulePluginManager = pluginManager ?? null;
    this.roundEndCallback = roundEndCallback;
    this.players = players ?? new Map();
    this.table = table ?? new Table();
  }

  // Player / table management is performed by the higher-level `Game`.
  // Round receives references to the players map and table so it can operate
  // on the same state without owning lifecycle responsibilities.

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
    // ENTRY CHECK: empty tile pile (draw/riichi)
    // TODO (design note): handle empty tile pile here. Guidance:
    // - Determine draw/liu-ju rule and whether to stop the round or continue
    // - Call relevant plugin hooks (e.g., LifecycleHookType.RoundEnd or a dedicated Draw hook)
    // - Record draw reason and trigger scoring or next round initialization
    // (Do not implement scoring here; this comment is the entry point guide.)
    if (this.table.getTilesCount() === 0) {
      return;
    }

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

    const actions = await this.checkPlayerActionType(
      this.getCurrentPlayer(),
      tile,
    );

    if (actions.includes(PlayerAction.Tsumo)) {
      this.pendingPlayerActions.set(currentPlayerId, [PlayerAction.Tsumo]);
      this.pendingPlayerDefaultActions.set(currentPlayerId, {
        action: TimeoutAction.Skip,
      });

      this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
      this.startActionTimeout(this.playerActionTimeLimit);
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

    for (const playerId of didntRespondedPlayerIds) {
      const defaultAction = this.pendingPlayerDefaultActions.get(playerId);
      switch (defaultAction?.action) {
        case TimeoutAction.Skip: {
          // Timeout: no extra action, mark as resolved (null indicates skipped)
          this.resolvedPlayerActions.set(playerId, null);
          break;
        }
        case TimeoutAction.DrawTile: {
          const player = this.getPlayerById(playerId);
          // On draw by timeout, prefer explicit payload (tile or index). If none provided,
          // take the last tile from the player's hand as a safe fallback. Real game logic
          // should be implemented in the rules module.
          let tile: MahjongTile | undefined;
          if (defaultAction.payload && 'tile' in defaultAction.payload) {
            tile = player.removeHandTile(
              (defaultAction.payload as any).tile as any,
            );
          } else {
            const idx =
              defaultAction.payload && 'index' in defaultAction.payload
                ? (defaultAction.payload as any).index
                : player.getHandTiles().length - 1;
            tile = player.removeHandTileByIndex(idx);
          }
          if (tile) this.table.addPlayerDrawedTile(playerId, tile);
          this.resolvedPlayerActions.set(playerId, PlayerAction.DrawTile);
          break;
        }
        default: {
          // Unknown default action: mark as resolved to continue the flow
          this.resolvedPlayerActions.set(playerId, null);
          break;
        }
      }
    }

    // If all pending players are resolved now, process their actions.
    const allResolved = Array.from(this.pendingPlayerActions.keys()).every(
      (id) => this.resolvedPlayerActions.has(id),
    );
    if (allResolved) {
      // Use the same resolution flow as when players actively resolve.
      for (const [id, action] of this.resolvedPlayerActions.entries()) {
        // NOTE: reuse existing resolution logic by invoking the resolve hook
        const player = this.getPlayerById(id);
        await this.runHook({
          hook: ActionHookType.ResolveAction,
          requestId: this.currentRequestId,
          payload: {
            action: action as PlayerAction,
            playerId: id,
            tiles: player.getHandTiles(),
          },
        });
      }
    }
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

  private static playerActionNumToEnum(
    action: number,
  ): PlayerAction | undefined {
    const actions = [
      PlayerAction.DrawTile,
      // ---
      PlayerAction.Chi,
      PlayerAction.Pon,
      PlayerAction.Kan,
      // ---
      PlayerAction.Ron,
      PlayerAction.Riichi,
      PlayerAction.Tsumo,
    ];
    if (action < 0 || action > actions.length - 1) {
      console.error('Invalid player action number:', action);
      return undefined;
    }
    return actions[action];
  }

  private async checkPlayerActionType(
    player: Player = this.getCurrentPlayer(),
    currentDrawTile: MahjongTile | null,
  ): Promise<PlayerAction[]> {
    const actionResults = await this.runHook({
      hook: ActionHookType.EvaluateAvailableActions,
      requestId: this.currentRequestId,
      payload: {
        playerId: this.getCurrentPlayerId(),
        tiles: currentDrawTile
          ? [...player.getHandTiles(), currentDrawTile]
          : player.getHandTiles(),
      },
    });
    if (!actionResults.accepted) {
      return [];
    }
    return actionResults.results
      .filter(
        (
          result,
        ): result is {
          pluginAction: number[];
        } => {
          const target = result as any;
          return 'pluginAction' in target && Array.isArray(target.pluginAction);
        },
      )
      .flatMap((result) => result.pluginAction || [])
      .map((actionNum) => Round.playerActionNumToEnum(actionNum))
      .filter((action): action is PlayerAction => action !== undefined);
  }

  private createTimeoutHandle(
    timeout: number,
    ...args: Parameters<typeof this.handleTimeoutAction>
  ): void {
    // Deprecated helper: delegate to startActionTimeout for safer binding
    this.startActionTimeout(timeout);
  }

  private startActionTimeout(timeout: number): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.timeoutHandle = setTimeout(() => {
      void this.handleTimeoutAction().catch((err) => {
        console.error('Error in handleTimeoutAction:', err);
      });
    }, timeout);
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
      const player = this.getPlayerById(id);
      switch (action) {
        case PlayerAction.Tsumo: {
          // On tsumo: lock winning hand, record source and hand composition, then proceed to scoring.
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Tsumo,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          break;
        }
        case PlayerAction.DrawTile: {
          // Draw tile resolution: plugins may act upon the player's current hand.
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.DrawTile,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          // TODO: if this.currentDrawTile is relevant, add to player's hand here according to rules.
          break;
        }
        case PlayerAction.Ron: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Ron,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          // On ron: lock the result, record the discarder, and stop other reaction checks.
          break;
        }
        case PlayerAction.Chi: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Chi,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          // TODO: validate chi (must be next player), remove tiles from hand and update melds.
          break;
        }
        case PlayerAction.Pon: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Pon,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          // TODO: validate pon (triplet), update melds and hand state.
          break;
        }
        case PlayerAction.Kan: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Kan,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          // TODO: handle open/closed/add kan flows and supplement draws.
          break;
        }
        case PlayerAction.Riichi: {
          await this.runHook({
            hook: ActionHookType.ResolveAction,
            requestId: this.currentRequestId,
            payload: {
              action: PlayerAction.Riichi,
              playerId: id,
              tiles: player.getHandTiles(),
            },
          });
          // TODO: mark riichi, deduct stick and continue next flows.
          break;
        }
        default: {
          // null indicates skip/timeout — nothing to do.
          break;
        }
      }
    }
  }

  private async handleRoundEnd(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    // Notify plugins of round end and allow them to apply patches
    await this.runHook({
      hook: LifecycleHookType.RoundEnd,
      requestId: this.currentRequestId,
      payload: {
        roundIndex: this.roundIndex,
      },
    });

    if (this.table.getTilesCount() === 0) {
      this.isRoundEnded = true;
    }

    // Reset Player Action Handle Properties
    this.pendingPlayerActions.clear();
    this.pendingPlayerDefaultActions.clear();
    this.resolvedPlayerActions.clear();
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.playerIdForTurnOrder.length;

    // Increase round index
    this.roundIndex += 1;
    this.currentWind = (this.currentWind + 1) % 4;
    if (this.table.getTilesCount() !== 0) {
      // If the tile wall is not empty, prepare for the next round:
      // - perform scoring preparation, collect draw reasons, and initialize next round state
      this.roundStatus = MahjongGameRoundStatus.RoundStart;
      this.next({ requestId: this.currentRequestId });
    }
    // If the tile wall is empty, the match should be finalized (end of game),
    // and external systems should be notified to show final results or scoring.

    if (this.isRoundEnded) {
      this.roundEndCallback!({
        roundIndex: this.roundIndex,
        isMatchEnd: this.isRoundEnded,
        tilesRemaining: this.table.getTilesCount(),
      });
    }
  }

  private async waitForPlayerAction(): Promise<void> {
    // Boardcast to frontend
    // Wip
  }

  public async next({
    requestId,
    args,
  }: GameNextRequest): Promise<GameNextResponse> {
    if (requestId !== this.currentRequestId) {
      throw new Error('Invalid request ID');
    }

    // Prevent concurrent processing from different requests; allow nested internal calls
    if (this.processingDepth > 0 && requestId !== this.currentRequestId) {
      throw new Error('Game is already processing');
    }
    this.processingDepth += 1;

    try {
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
          this.waitForPlayerAction();
          break;
        }
        case MahjongGameRoundStatus.ResolvingPlayerAction: {
          const isValidType = PlayerActionType.safeParse(args);
          if (!isValidType.success) {
            throw new Error('Invalid player action type');
          }
          await this.handleResolvingPlayerAction(isValidType.data);
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
      return { requestId: this.currentRequestId };
    } finally {
      this.processingDepth -= 1;
      // Rotate request id after processing (prevents replay)
      this.currentRequestId = randomUUIDv7();
    }
  }

  // Preferred method name
  public setCurrentDrawnTile(tile: MahjongTile): void {
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

  public getStatus(): MahjongGameRoundStatus {
    return this.roundStatus;
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

  private async calcScore(): Promise<void> {
    // Score calculation guidance (not implemented):
    // - This function should evaluate the current table / player's hands and
    //   compute score deltas for the round.
    // - Scoring can be performed by a dedicated scoring engine or via plugins
    //   (call plugin hooks similar to EvaluateAvailableActions / ResolveAction).
    // - Once scores are computed, use `patchesReslover` to apply `PlayerScores` patches
    //   so that player objects are updated consistently.
    // - Keep the calculation pure (input -> score patches) and apply via patchesReslover.
    const sharedData = await this.buildCurrentPluginRunnerSharedData();

    const winingPlayerId = this.getCurrentPlayerId();
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
        results: Array<unknown>;
      }
  > {
    // Call plugin manager if available; otherwise treat as accepted with no results.
    const rawResult = this.modulePluginManager
      ? await this.modulePluginManager.runHook(data)
      : [];

    const parsedResults: any[] = [];
    if (Array.isArray(rawResult)) {
      for (const item of rawResult) {
        const parsed = PluginHookResultItem.safeParse(item);
        if (parsed.success) {
          parsedResults.push(parsed.data);
        } else {
          console.warn('Invalid plugin result item, ignoring:', item);
        }
      }
    } else {
      console.warn('Plugin manager returned non-array hook result:', rawResult);
    }

    const notAcceptedResult = parsedResults.find(
      (result: any) => result && result.reject,
    );
    if (notAcceptedResult) {
      return { accepted: false };
    }

    const gameStatusPatches = parsedResults
      .filter((result: any) => 'gameStatsPatch' in result)
      .flatMap((result: any) => result.gameStatsPatch || []);
    this.patchesReslover(gameStatusPatches);
    return { accepted: true, results: parsedResults };
  }

  public cleanup() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    // Do NOT clear `players` or `table` here — they are owned by `Game`.
    this.playerIdForTurnOrder = [];
    this.currentPlayerIndex = 0;
    this.currentDrawTile = null;
    this.pendingPlayerActions.clear();
    this.pendingPlayerDefaultActions.clear();
    this.resolvedPlayerActions.clear();
    this.pluginStateStorage.clear();
  }
}

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

  constructor({
    playerActionTimeLimit = 20_000,
    runnergRPCClient,
    storagegRPCClient,
    onRoundEnd,
    onGameEnd,
    gameEndCallback,
  }: {
    playerActionTimeLimit?: number;
    runnergRPCClient: ReturnType<typeof createRunnerGateway>;
    storagegRPCClient: ReturnType<typeof createStorageGateway>;
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

  public sendEventToPlayer<T extends GameMessageEnum>(
    playerId: string,
    event: T,
    payload: GameMessagePayloads[T],
  ): void {}

  public broadcastEvent<T extends GameMessageEnum>(
    event: T,
    payload: GameMessagePayloads[T],
  ): void {}

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
