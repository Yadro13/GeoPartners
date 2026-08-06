ALTER TABLE "plot" ADD COLUMN "road_ownership_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "servitude_valid_from" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "servitude_valid_until" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "servitude_payment_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "servitude_payment_period" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "substation_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "substation_capacity_mw" numeric(12, 3);