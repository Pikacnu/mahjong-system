import { randomUUIDv7 } from 'bun';
import { Game, type GameEndCallbackData } from '../classes/game';
import type { RunnerGateway, StorageGateway } from '../classes/gateway';

export class GameInstanceManager {
  private gameInstances = new Map<string, Game>();
  private static instance: GameInstanceManager | null = null;
  private static runnerGateway: RunnerGateway | null = null;
  private static storageGateway: StorageGateway | null = null;

  public static getInstanceManager({
    runnerGateway,
    storageGateway,
  }: {
    runnerGateway: RunnerGateway;
    storageGateway: StorageGateway;
  }): GameInstanceManager {
    GameInstanceManager.runnerGateway = runnerGateway;
    GameInstanceManager.storageGateway = storageGateway;
    if (!GameInstanceManager.instance) {
      GameInstanceManager.instance = new GameInstanceManager();
    }
    return GameInstanceManager.instance;
  }

  public isInitialized(): boolean {
    return (
      GameInstanceManager.runnerGateway !== null &&
      GameInstanceManager.storageGateway !== null
    );
  }

  public createGameInstance(): string {
    const gameId = randomUUIDv7();
    if (this.gameInstances.has(gameId)) {
      throw new Error(`Game instance with id ${gameId} already exists`);
    }
    if (!this.isInitialized()) {
      throw new Error(`GameInstanceManager is not initialized`);
    }
    const gameInstance = new Game({
      runnergRPCClient: GameInstanceManager.runnerGateway!,
      storagegRPCClient: GameInstanceManager.storageGateway!,
      gameEndCallback: ((gameId: string) => {
        return ((data: GameEndCallbackData) => {
          // Handle game/round end logic here, e.g., logging, cleanup, notifying other services, etc.
          console.log(`Game with id ${gameId} ended. Data:`, data);
          this.removeGameInstance(gameId);
        }).bind(this);
      }).bind(this, gameId),
    });
    this.gameInstances.set(gameId, gameInstance);
    return gameId;
  }

  public getGameInstance(gameId: string): Game {
    const gameInstance = this.gameInstances.get(gameId);
    if (!gameInstance) {
      throw new Error(`Game instance with id ${gameId} does not exist`);
    }
    return gameInstance;
  }

  public removeGameInstance(gameId: string): void {
    const gameInstance = this.gameInstances.get(gameId);
    if (!gameInstance) {
      throw new Error(`Game instance with id ${gameId} does not exist`);
    }
    gameInstance.cleanup();
    this.gameInstances.delete(gameId);
  }
}
