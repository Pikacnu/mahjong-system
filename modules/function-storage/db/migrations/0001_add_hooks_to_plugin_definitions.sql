ALTER TABLE "function_storage"."plugin_definitions"
ADD COLUMN "hooks" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint