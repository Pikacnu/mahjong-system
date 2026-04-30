import { randomUUIDv7 } from 'bun';
import { EventEmitter } from 'events';

// 遊戲 -> 集中 -> 轉發到不同連線

export class ConnectionManager {
  private connectionMap: Map<string, Connection> = new Map();
  private roomConnectionsMap: Map<string, Set<string>> = new Map(); // roomId -> set of connectionIds
  private playerConnectionMap: Map<string, string> = new Map(); // playerId -> connectionId
  constructor() {}

  public createConnection(connectionId = randomUUIDv7()): Connection {
    if (this.connectionMap.has(connectionId)) {
      throw new Error(`Connection ID: ${connectionId} already exists.`);
    }
    const connection = new Connection(connectionId);
    this.connectionMap.set(connectionId, connection);
    return connection;
  }

  public addConnectionToRoom(roomId: string, connectionId: string) {
    if (!this.connectionMap.has(connectionId)) return;
    if (!this.roomConnectionsMap.has(roomId)) {
      this.roomConnectionsMap.set(roomId, new Set());
    }
    this.roomConnectionsMap.get(roomId)?.add(connectionId);
  }

  public removeConnection(connectionId: string) {
    const connection = this.connectionMap.get(connectionId);
    if (connection) {
      connection.cleanup();
      this.connectionMap.delete(connectionId);
      // remove from any room registrations
      for (const [roomId, set] of this.roomConnectionsMap.entries()) {
        if (set.has(connectionId)) {
          set.delete(connectionId);
          if (set.size === 0) this.roomConnectionsMap.delete(roomId);
        }
      }
    }
  }

  public createRoomConnection(roomId: string) {
    const connection = this.createConnection();
    const connectionId = connection.getConnectionId();
    if (!this.roomConnectionsMap.has(roomId)) {
      this.roomConnectionsMap.set(roomId, new Set());
    }
    this.roomConnectionsMap.get(roomId)?.add(connectionId);
    return connection;
  }

  public broadcastToRoom(roomId: string, message: unknown) {
    const set = this.roomConnectionsMap.get(roomId);
    if (!set) return;
    for (const connectionId of set) {
      const conn = this.connectionMap.get(connectionId);
      if (!conn) continue;
      try {
        conn.sendEvent(message);
      } catch (e) {
        // ignore per-connection errors
      }
    }
  }

  public unregisterRoomConnection(roomId: string, connectionId: string) {
    this.roomConnectionsMap.get(roomId)?.delete(connectionId);
    if (this.roomConnectionsMap.get(roomId)?.size === 0) {
      this.roomConnectionsMap.delete(roomId);
    }
  }

  public cleanup() {
    for (const connection of this.connectionMap.values()) {
      connection.cleanup();
    }
    this.connectionMap.clear();
    this.roomConnectionsMap.clear();
    this.playerConnectionMap.clear();
  }
}

export const connectionManager = new ConnectionManager();

/**
 * lobby -> gameClass (gRPC) -> Event Emit -> Connection Manager
 * -> Connection Callback -> Round Process
 *
 * Round Process -> lobby(Send Event) -> Event Emit
 * -> Connection Manager -> Connection Callback -> lobby Websocket Callback
 * 玩家 ID -> Event ID
 * boardCast -> 找出所有 ID Emit
 *
 */

export class Connection {
  private callbackFunctionList: Map<
    string,
    Array<{ id: string; callback: Function }>
  > = new Map();
  private connectionId: string;
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }
  public handleEvent(event: string, payload: unknown) {
    const callbacks = this.callbackFunctionList.get(event);
    if (callbacks) {
      callbacks.forEach(({ callback }) => {
        try {
          callback?.(payload);
        } catch (e) {
          // ignore individual callback errors
        }
      });
    }
  }

  public registerCallback(
    event: string,
    callback: Function,
    callbackId = randomUUIDv7(),
  ): string {
    const list = this.callbackFunctionList.get(event) || [];
    list.push({ id: callbackId, callback });
    this.callbackFunctionList.set(event, list);
    return callbackId;
  }

  public unregisterCallback(event: string, callbackId: string) {
    if (!this.callbackFunctionList.has(event)) {
      throw new Error(`Event ${event} is not registered.`);
    }
    const callbacks = this.callbackFunctionList.get(event) || [];
    const filtered = callbacks.filter((cb) => cb.id !== callbackId);
    if (filtered.length > 0) {
      this.callbackFunctionList.set(event, filtered);
    } else {
      this.callbackFunctionList.delete(event);
    }
  }

  public getConnectionId() {
    return this.connectionId;
  }

  public sendEvent(event: any) {
    // ensure payload is Buffer if possible
    if (event && event.payload != null) {
      const p = event.payload;
      if (!Buffer.isBuffer(p) && !(p instanceof Uint8Array)) {
        try {
          const text = typeof p === 'string' ? p : JSON.stringify(p);
          event.payload = Buffer.from(text, 'utf-8');
        } catch (_) {
          // leave as-is if cannot serialize
        }
      }
    }
    // emit a generic message event for listeners
    this.eventEmitter.emit('message', event);
  }

  public getEventEmitter() {
    return this.eventEmitter;
  }

  public cleanup() {
    this.callbackFunctionList.clear();
    this.eventEmitter.removeAllListeners();
  }
}
