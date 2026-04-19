import { randomUUIDv7 } from 'bun';
import { Game, type GameEndCallbackData } from '../type/game';
import type { RunnerGateway, StorageGateway } from '../type/gateway';

export class GameInstanceManager {
  private gameInstances = new Map<string, Game>();
  private instance: GameInstanceManager | null = null;
  private runnerGateway: RunnerGateway | null = null;
  private storageGateway: StorageGateway | null = null;

  public getInstanceManager({
    runnerGateway,
    storageGateway,
  }: {
    runnerGateway: RunnerGateway;
    storageGateway: StorageGateway;
  }): GameInstanceManager {
    this.runnerGateway = runnerGateway;
    this.storageGateway = storageGateway;
    if (!this.instance) {
      this.instance = new GameInstanceManager();
    }
    return this.instance;
  }

  public isInitialized(): boolean {
    return this.runnerGateway !== null && this.storageGateway !== null;
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
      runnergRPCClient: this.runnerGateway!,
      storagegRPCClient: this.storageGateway!,
      gameEndCallback: ((gameId: string) => {
        return ((data: GameEndCallbackData) => {
          // Handle game end logic here, e.g., logging, cleanup, notifying other services, etc.
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
