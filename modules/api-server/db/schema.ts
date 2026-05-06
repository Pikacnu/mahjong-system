import {
  pgSchema,
  integer,
  text,
  jsonb,
  pgEnum,
  serial,
  date,
} from 'drizzle-orm/pg-core';

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
  id: serial().primaryKey().unique(),
  createdAt: date().notNull().defaultNow(),
  updatedAt: date().notNull().defaultNow(),
});

export const room = schema.table('room', {
  id: serial().primaryKey().unique(),
  status: roomStatusEnum().notNull().default('waiting'),
  createdAt: date().notNull().defaultNow(),
  updatedAt: date().notNull().defaultNow(),
});

export const player = schema.table('player', {
  id: serial().primaryKey().unique(),
  name: text().notNull(),
});

export const gameRoomBinding = schema.table('game_room_binding', {
  id: serial().primaryKey().unique(),
  gameId: serial()
    .notNull()
    .references(() => game.id),
  roomId: serial()
    .notNull()
    .references(() => room.id),
});

export const roomPlayerBinding = schema.table('room_player_binding', {
  id: serial().primaryKey().unique(),
  roomId: serial()
    .notNull()
    .references(() => room.id),
  playerId: serial()
    .notNull()
    .references(() => player.id),
});
