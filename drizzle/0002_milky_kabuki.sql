CREATE TABLE "plot_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" text NOT NULL,
	"audit_log_id" uuid NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plot_version" ADD CONSTRAINT "plot_version_audit_log_id_audit_log_id_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_version" ADD CONSTRAINT "plot_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plot_version_audit_log_idx" ON "plot_version" USING btree ("audit_log_id");--> statement-breakpoint
CREATE INDEX "plot_version_plot_created_idx" ON "plot_version" USING btree ("plot_id","created_at");