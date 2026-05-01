CREATE SCHEMA IF NOT EXISTS "api-server";
--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('waiting', 'playing', 'finished');--> statement-breakpoint
CREATE TYPE "public"."log_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('waiting', 'playing', 'finished');--> statement-breakpoint
CREATE TABLE "api-server"."game" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" integer NOT NULL,
	"updatedAt" integer NOT NULL,
	CONSTRAINT "game_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "api-server"."game_logs_queue" (
	"id" integer PRIMARY KEY NOT NULL,
	"gameId" integer NOT NULL,
	"log" text NOT NULL,
	"status" "log_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "game_logs_queue_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "api-server"."game_room_binding" (
	"id" serial PRIMARY KEY NOT NULL,
	"gameId" serial NOT NULL,
	"roomId" serial NOT NULL,
	CONSTRAINT "game_room_binding_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "api-server"."game_snapshots" (
	"id" integer PRIMARY KEY NOT NULL,
	"gameId" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" "game_status" DEFAULT 'waiting' NOT NULL,
	CONSTRAINT "game_snapshots_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "api-server"."player" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "player_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "api-server"."room" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "room_status" DEFAULT 'waiting' NOT NULL,
	"createdAt" integer NOT NULL,
	"updatedAt" integer NOT NULL,
	CONSTRAINT "room_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "api-server"."room_player_binding" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" serial NOT NULL,
	"playerId" serial NOT NULL,
	CONSTRAINT "room_player_binding_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "api-server"."game_room_binding" ADD CONSTRAINT "game_room_binding_gameId_game_id_fk" FOREIGN KEY ("gameId") REFERENCES "api-server"."game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api-server"."game_room_binding" ADD CONSTRAINT "game_room_binding_roomId_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "api-server"."room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api-server"."room_player_binding" ADD CONSTRAINT "room_player_binding_roomId_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "api-server"."room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api-server"."room_player_binding" ADD CONSTRAINT "room_player_binding_playerId_player_id_fk" FOREIGN KEY ("playerId") REFERENCES "api-server"."player"("id") ON DELETE no action ON UPDATE no action;