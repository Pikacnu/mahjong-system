CREATE SCHEMA "function_storage";
--> statement-breakpoint
CREATE TYPE "function_storage"."builtinMethodsType" AS ENUM('function', 'modules');--> statement-breakpoint
CREATE TYPE "function_storage"."sourceType" AS ENUM('builtin', 'user');--> statement-breakpoint
CREATE TABLE "function_storage"."dependencies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "function_storage"."dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_version_id" integer NOT NULL,
	"dependency_version_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_storage"."method" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "function_storage"."method_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"source_type" "function_storage"."sourceType" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"create_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "method_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "function_storage"."plugin_definitions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "function_storage"."plugin_definitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version_id" integer NOT NULL,
	"default_store" jsonb DEFAULT '{}' NOT NULL,
	"hooks" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_storage"."resource" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "function_storage"."resource_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_storage"."versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "function_storage"."versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version" integer NOT NULL,
	"method_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resource_type" "function_storage"."builtinMethodsType" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "function_storage"."dependencies" ADD CONSTRAINT "dependencies_source_version_id_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "function_storage"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_storage"."dependencies" ADD CONSTRAINT "dependencies_dependency_version_id_versions_id_fk" FOREIGN KEY ("dependency_version_id") REFERENCES "function_storage"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_storage"."plugin_definitions" ADD CONSTRAINT "plugin_definitions_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "function_storage"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_storage"."versions" ADD CONSTRAINT "versions_method_id_method_id_fk" FOREIGN KEY ("method_id") REFERENCES "function_storage"."method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_storage"."versions" ADD CONSTRAINT "versions_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "function_storage"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dependencies_source_version_id" ON "function_storage"."dependencies" USING btree ("source_version_id");--> statement-breakpoint
CREATE INDEX "idx_dependencies_dependency_version_id" ON "function_storage"."dependencies" USING btree ("dependency_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dependencies_source_dependency_version" ON "function_storage"."dependencies" USING btree ("source_version_id","dependency_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plugin_definitions_version_id" ON "function_storage"."plugin_definitions" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_plugin_definitions_version_id" ON "function_storage"."plugin_definitions" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_resource_hash" ON "function_storage"."resource" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "idx_versions_method_id" ON "function_storage"."versions" USING btree ("method_id");--> statement-breakpoint
CREATE INDEX "idx_versions_method_version" ON "function_storage"."versions" USING btree ("method_id","version");--> statement-breakpoint
CREATE INDEX "idx_versions_resource_id" ON "function_storage"."versions" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_versions_method_version_type" ON "function_storage"."versions" USING btree ("method_id","version");