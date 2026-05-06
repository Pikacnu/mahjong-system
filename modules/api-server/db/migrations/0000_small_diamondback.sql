CREATE SCHEMA IF NOT EXISTS "api-server";
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'api-server')) THEN
        CREATE TYPE "api-server"."game_status" AS ENUM('waiting', 'playing', 'finished');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'api-server')) THEN
        CREATE TYPE "api-server"."log_status" AS ENUM('pending', 'processed', 'failed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'api-server')) THEN
        CREATE TYPE "api-server"."room_status" AS ENUM('waiting', 'playing', 'finished');
    END IF;
END $$;

-- 3. Fixed Table Syntax (IF NOT EXISTS comes before the table name)
CREATE TABLE IF NOT EXISTS "api-server"."game" (
  "id" serial PRIMARY KEY NOT NULL,
  "createdAt" date DEFAULT now() NOT NULL,
  "updatedAt" date DEFAULT now() NOT NULL,
  CONSTRAINT "game_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "api-server"."game_logs_queue" (
  "id" integer PRIMARY KEY NOT NULL,
  "gameId" integer NOT NULL,
  "log" text NOT NULL,
  "status" "api-server"."log_status" DEFAULT 'pending' NOT NULL,
  CONSTRAINT "game_logs_queue_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "api-server"."game_room_binding" (
  "id" serial PRIMARY KEY NOT NULL,
  "gameId" integer NOT NULL,
  "roomId" integer NOT NULL,
  CONSTRAINT "game_room_binding_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "api-server"."game_snapshots" (
  "id" integer PRIMARY KEY NOT NULL,
  "gameId" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "status" "api-server"."game_status" DEFAULT 'waiting' NOT NULL,
  CONSTRAINT "game_snapshots_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "api-server"."player" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  CONSTRAINT "player_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "api-server"."room" (
  "id" serial PRIMARY KEY NOT NULL,
  "status" "api-server"."room_status" DEFAULT 'waiting' NOT NULL,
  "createdAt" date DEFAULT now() NOT NULL,
  "updatedAt" date DEFAULT now() NOT NULL,
  CONSTRAINT "room_id_unique" UNIQUE("id")
);

CREATE TABLE IF NOT EXISTS "api-server"."room_player_binding" (
  "id" serial PRIMARY KEY NOT NULL,
  "roomId" integer NOT NULL,
  "playerId" integer NOT NULL,
  CONSTRAINT "room_player_binding_id_unique" UNIQUE("id")
);

-- 4. Foreign Keys
-- These stay the same as they don't use IF NOT EXISTS syntax
ALTER TABLE "api-server"."game_room_binding" ADD CONSTRAINT "game_room_binding_gameId_game_id_fk" FOREIGN KEY ("gameId") REFERENCES "api-server"."game"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "api-server"."game_room_binding" ADD CONSTRAINT "game_room_binding_roomId_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "api-server"."room"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "api-server"."room_player_binding" ADD CONSTRAINT "room_player_binding_roomId_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "api-server"."room"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "api-server"."room_player_binding" ADD CONSTRAINT "room_player_binding_playerId_player_id_fk" FOREIGN KEY ("playerId") REFERENCES "api-server"."player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;