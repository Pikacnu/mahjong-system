import { randomUUIDv7 } from 'bun';
import {
  ActionHookType,
  GameEndTypeEnum,
  GameMessageEnum,
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
import type { Game, GameEndCallbackData } from './game';
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
    Array.from(this.players).map(([playerId, player]) => {
      this.sendMessageToPlayer(playerId, GameMessageEnum.ChangePlayerHand, {
        newHand: player
          .getHandTiles()
          .map((tile) => tile.type * 100 + tile.index),
      });
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
