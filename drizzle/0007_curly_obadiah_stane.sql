ALTER TABLE "plot" ADD COLUMN "status_progress" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "plot" AS p
SET "status_progress" = jsonb_build_array(jsonb_build_object(
	'statusId', s."id",
	'completedAt', p."updated_at",
	'cost', NULL
))
FROM "plot_status" AS s
WHERE p."workspace" = s."workspace"
	AND p."status" <> ''
	AND p."status" = s."name";
