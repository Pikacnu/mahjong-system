import { pgSchema, integer, text, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const schema = pgSchema('api-server');

export const logStatusEnum = pgEnum('log_status', [
  'pending',
  'processed',
  'failed',
]);

export const gameStatusEnum = pgEnum('game_status', [
  'waiting',
  'playing',
  'finished',
]);

export const roomStatusEnum = pgEnum('room_status', [
  'waiting',
  'playing',
  'finished',
]);

export const gameLogsQueue = schema.table('game_logs_queue', {
  id: integer().primaryKey().unique(),
  gameId: integer().notNull(),
  log: text().notNull(),
  status: logStatusEnum().notNull().default('pending'),
});

export const gameSnapshots = schema.table('game_snapshots', {
  id: integer().primaryKey().unique(),
  gameId: integer().notNull(),
  snapshot: jsonb().notNull(),
  status: gameStatusEnum().notNull().default('waiting'),
});

export const game = schema.table('game', {
  id: integer().primaryKey().unique(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

export const room = schema.table('room', {
  id: integer().primaryKey().unique(),
  status: roomStatusEnum().notNull().default('waiting'),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

export const player = schema.table('player', {
  id: integer().primaryKey().unique(),
  name: text().notNull(),
});

export const gameRoomBinding = schema.table('game_room_binding', {
  id: integer().primaryKey().unique(),
  gameId: integer()
    .notNull()
    .references(() => game.id),
  roomId: integer()
    .notNull()
    .references(() => room.id),
});

export const roomPlayerBinding = schema.table('room_player_binding', {
  id: integer().primaryKey().unique(),
  roomId: integer()
    .notNull()
    .references(() => room.id),
  playerId: integer()
    .notNull()
    .references(() => player.id),
});
