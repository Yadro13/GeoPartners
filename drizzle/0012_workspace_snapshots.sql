CREATE TABLE "workspace_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace" "data_workspace" DEFAULT 'production' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"plot_count" integer NOT NULL,
	"category_count" integer NOT NULL,
	"status_count" integer NOT NULL,
	"captured_by" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_snapshot" ADD CONSTRAINT "workspace_snapshot_captured_by_user_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_snapshot_workspace_captured_idx" ON "workspace_snapshot" USING btree ("workspace","captured_at");--> statement-breakpoint
CREATE FUNCTION "prevent_workspace_snapshot_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'workspace snapshots are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "workspace_snapshot_immutable"
BEFORE UPDATE ON "workspace_snapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_workspace_snapshot_update"();
