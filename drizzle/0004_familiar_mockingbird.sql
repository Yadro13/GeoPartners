CREATE TYPE "public"."user_access_level" AS ENUM('read', 'edit');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_level" "user_access_level" DEFAULT 'read' NOT NULL;