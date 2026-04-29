import { randomUUIDv7 } from 'bun';
import {
  ActionHookType,
  GameEndTypeEnum,
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
  TimeoutAction,
  type TimeoutActionEvent,
  type ActionSharedData,
  DecisionHookType,
  PluginActionType,
  PatchActionType,
} from 'utils';
import { shuffleArray } from 'utils';
import z from 'zod';
import { EventEmitter } from 'events';

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
import type { RoomEvent } from 'proto/src/generated/services/room';

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
  private game: Game | null = null;

  constructor({
    playerActionTimeLimit = 20_000,
    roundEndCallback,
    players,
    table,
    pluginManager,
    gameClass,
  }: {
    playerActionTimeLimit?: number;
    gameClass: Game;
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
    this.game = gameClass;
  }

  private boardcastMessage(...args: Parameters<Game['broadcastEvent']>): void {
    return this.game?.broadcastEvent(...args);
  }

  private sendMessageToPlayer(
    ...args: Parameters<Game['sendEventToPlayer']>
  ): void {
    return this.game?.sendEventToPlayer(...args);
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

    let hasEndAction = false;
    let hasTurnChangingAction = false;
    let actingPlayerId = playerId;

    for (const [id, action] of this.resolvedPlayerActions.entries()) {
      const player = this.getPlayerById(id);
      if (action === null) continue;

      await this.runHook({
        hook: ActionHookType.ResolveAction,
        requestId: this.currentRequestId,
        payload: {
          action: action,
          playerId: id,
          tiles: player.getHandTiles(),
        },
      });

      switch (action) {
        case PlayerAction.Tsumo:
        case PlayerAction.Ron: {
          hasEndAction = true;
          break;
        }
        case PlayerAction.Chi:
        case PlayerAction.Pon:
        case PlayerAction.Kan: {
          hasTurnChangingAction = true;
          actingPlayerId = id;
          break;
        }
        case PlayerAction.Riichi:
        case PlayerAction.DrawTile: {
          // These are discard actions or modifiers to the current turn
          break;
        }
      }
    }

    if (hasEndAction) {
      this.roundStatus = MahjongGameRoundStatus.RoundEnd;
    } else if (hasTurnChangingAction) {
      // Turn jumps to the player who Chi/Pon/Kan
      this.currentPlayerIndex =
        this.playerIdForTurnOrder.indexOf(actingPlayerId);
      // For Kan, they need a supplement tile. For Chi/Pon, they need to discard.
      // Simplification: transition to WaitingForPlayerAction for discard, or PlayerGetsTile for Kan.
      const lastAction = this.resolvedPlayerActions.get(actingPlayerId);
      if (lastAction === PlayerAction.Kan) {
        this.roundStatus = MahjongGameRoundStatus.PlayerGetsTile;
      } else {
        this.roundStatus = MahjongGameRoundStatus.WaitingForPlayerAction;
      }
    } else {
      // No one reacted to the discard, or it was just a discard.
      // Move to next player.
      this.currentPlayerIndex =
        (this.currentPlayerIndex + 1) % this.playerIdForTurnOrder.length;
      this.roundStatus = MahjongGameRoundStatus.PlayerGetsTile;
    }

    // Reset resolved actions and move forward
    this.pendingPlayerActions.clear();
    this.pendingPlayerDefaultActions.clear();
    this.resolvedPlayerActions.clear();

    await this.next({ requestId: this.currentRequestId });
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

    // Increase round index
    this.roundIndex += 1;
    this.currentWind = (this.currentWind + 1) % 4;

    if (this.isRoundEnded || this.table.getTilesCount() === 0) {
      this.boardcastMessage(GameMessageEnum.RoundEnd, {
        type: GameEndTypeEnum.OutOfTiles,
      });
      this.roundEndCallback!({
        roundIndex: this.roundIndex,
        isMatchEnd: true,
        tilesRemaining: this.table.getTilesCount(),
      });
    } else {
      // If the tile wall is not empty, prepare for the next round
      this.roundStatus = MahjongGameRoundStatus.RoundStart;
      await this.next({ requestId: this.currentRequestId });
    }
  }

  private async waitForPlayerAction(): Promise<void> {
    // Broadcast status to players to inform them it's someone's turn to act
    this.boardcastMessage(GameMessageEnum.RoundStatusChanged, {
      status: this.roundStatus,
      currentPlayerId: this.getCurrentPlayerId(),
    } as any);
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
      if (
        this.table.getTilesCount() === 0 &&
        this.roundStatus !== MahjongGameRoundStatus.RoundEnd &&
        this.roundStatus !== MahjongGameRoundStatus.ResolvingPlayerAction
      ) {
        this.roundStatus = MahjongGameRoundStatus.RoundEnd;
      }

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
          await this.waitForPlayerAction();
          break;
        }

        case MahjongGameRoundStatus.ResolvingPlayerAction: {
          const isValidType = PlayerActionType.safeParse(args);
          if (!isValidType.success) {
            throw new Error('Invalid player action type');
          }

          // Validate action via plugins before resolving
          const validationResult = await this.runHook({
            hook: ActionHookType.ValidateAction,
            requestId: this.currentRequestId,
            payload: {
              ...isValidType.data,
              tiles: this.getPlayerById(
                isValidType.data.playerId,
              ).getHandTiles(),
            },
          });

          if (!validationResult.accepted) {
            // If any plugin rejects the action, we stop here and wait for a valid action or timeout
            return { requestId: this.currentRequestId };
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
      playersData: Array.from(this.players.entries()).map(
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
          player.adjustScore(delta);
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
        case PlayerStatusPatches.PlayerActionTiles: {
          const { playerId, actionTiles } = patch.data;
          const player = this.players.get(playerId);
          if (!player) {
            console.warn('Player not found for action tiles patch:', playerId);
            break;
          }
          // Assuming actionTiles are added to melds/action logs
          // This matches the Table.playerAction and Player.playerAction logic
          // Note: PlayerActionTileEntry might be needed instead of just tiles
          for (const tile of actionTiles) {
            this.table.addPlayerUsedTile(playerId, tile);
          }
          break;
        }
        // Game Status Patches
        case GameStatusPatches.GameStats: {
          // Update game-level statistics
          break;
        }
        case GameStatusPatches.RedDoraTile: {
          const { redDoraTile, action } = patch.data;
          if (action === PatchActionType.Add) {
            this.table.addRedDoraTile(redDoraTile);
          } else {
            this.table.removeRedDoraTile(redDoraTile);
          }
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

    const evaluationResult = await this.modulePluginManager?.runHook({
      hook: DecisionHookType.EvaluateHand,
      requestId: this.currentRequestId,
      payload: sharedData,
    });
    // Todo Change this to more flexible way to store values
    const tempStorage: { [key: string]: any } = {
      han: 0,
      fu: 0,
      yakuList: [] as string[],
    };

    // Normalize and merge plugin evaluation payloads into tempStorage
    if (Array.isArray(evaluationResult)) {
      for (const evaluationItem of evaluationResult) {
        const rawActions = evaluationItem.pluginAction || [];
        const evalActions = Array.isArray(rawActions)
          ? rawActions.filter(
              (a: any) => a && a.type === PluginActionType.EVALUATION,
            )
          : [];

        for (const act of evalActions) {
          const payload = (act && (act as any).payload) ?? act;
          if (!payload || typeof payload !== 'object') continue;
          for (const [k, v] of Object.entries(payload)) {
            if (k in tempStorage) {
              const targetVal = tempStorage[k];
              if (Array.isArray(targetVal)) {
                tempStorage[k] = targetVal.concat(Array.isArray(v) ? v : [v]);
                continue;
              }
              if (typeof targetVal === 'number' && typeof v === 'number') {
                tempStorage[k] = targetVal + v;
                continue;
              }
              if (
                typeof targetVal === 'object' &&
                targetVal !== null &&
                typeof v === 'object' &&
                v !== null &&
                !Array.isArray(v)
              ) {
                tempStorage[k] = { ...targetVal, ...(v as object) };
                continue;
              }
              // Fallback: overwrite
              tempStorage[k] = v;
            } else {
              tempStorage[k] = v;
            }
          }
        }
      }
    }

    const scoreCalcResult = await this.modulePluginManager?.runHook({
      hook: DecisionHookType.CalculateScore,
      requestId: this.currentRequestId,
      payload: { sharedData, ...tempStorage } as any,
    });
    // Todo: Complete score Calculation flow
    // Merge score calculation results

    // ScoreCalc Hook required to modify global storage variable
    // Named "scoreDistribution"
    // and it should run by the priority
    // then the last scoreDistribution patch will used

    // format:
    // {
    //   [playerID:string]:score:number
    // }

    let scoreDistribution: unknown;

    const scoreResultsArray = Array.isArray(scoreCalcResult)
      ? [...scoreCalcResult].reverse()
      : [];
    for (const result of scoreResultsArray) {
      const targetStoragePatch = result.storagePatch?.filter(
        (patch) => patch.key === 'scoreDistribution' && !!patch.value,
      )[0];
      if (targetStoragePatch) {
        scoreDistribution = targetStoragePatch.value;
        break;
      }
    }

    if (scoreDistribution && typeof scoreDistribution === 'object') {
      for (const [playerID, score] of Object.entries(
        scoreDistribution as any,
      )) {
        const player = this.players.get(playerID);
        if (!player) {
          console.warn(
            `Player not found for score distribution patch: ${playerID}`,
          );
          continue;
        }
        const numericScore = Number(score);
        if (Number.isFinite(numericScore)) {
          player.adjustScore(numericScore);
        } else {
          console.warn(`Invalid score for player ${playerID}:`, score);
        }
      }
    } else {
      console.error(
        'Invalid or missing score distribution from plugins:',
        scoreDistribution,
      );
    }
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

  private gameInfoMessageEmitter: EventEmitter = new EventEmitter();

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

  public sendEventToPlayer<T extends keyof GameMessagePayloads>(
    playerId: string,
    event: T,
    payload: GameMessagePayloads[T],
  ): void {}

  public broadcastEvent<T extends keyof GameMessagePayloads>(
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

  public reslovedPlayerAction(playerId: string, action: PlayerAction): void {}

  public processedRoomAction(event: RoomEvent, payload: any): void {
    switch (event) {
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
