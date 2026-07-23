CREATE TYPE "public"."data_workspace" AS ENUM('production', 'sandbox');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"test_workspace_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "plot" DROP CONSTRAINT "plot_category_id_category_id_fk";
--> statement-breakpoint
ALTER TABLE "category" DROP CONSTRAINT "category_pkey";--> statement-breakpoint
ALTER TABLE "plot" DROP CONSTRAINT "plot_pkey";--> statement-breakpoint
DROP INDEX "audit_log_created_at_idx";--> statement-breakpoint
DROP INDEX "audit_log_entity_idx";--> statement-breakpoint
DROP INDEX "plot_cadastral_number_idx";--> statement-breakpoint
DROP INDEX "plot_version_plot_created_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "workspace" "data_workspace" DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "workspace" "data_workspace" DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "workspace" "data_workspace" DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot_version" ADD COLUMN "workspace" "data_workspace" DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_workspace_id_pk" PRIMARY KEY("workspace","id");--> statement-breakpoint
ALTER TABLE "plot" ADD CONSTRAINT "plot_workspace_id_pk" PRIMARY KEY("workspace","id");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot" ADD CONSTRAINT "plot_workspace_category_fk" FOREIGN KEY ("workspace","category_id") REFERENCES "public"."category"("workspace","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_workspace_created_idx" ON "audit_log" USING btree ("workspace","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_entity_idx" ON "audit_log" USING btree ("workspace","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_workspace_cadastral_idx" ON "plot" USING btree ("workspace","cadastral_number");--> statement-breakpoint
CREATE INDEX "plot_version_workspace_plot_created_idx" ON "plot_version" USING btree ("workspace","plot_id","created_at");
