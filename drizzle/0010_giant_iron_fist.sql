ALTER TABLE "category" ADD COLUMN "system_role" text;--> statement-breakpoint
ALTER TABLE "plot" ADD COLUMN "result_links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "category_workspace_system_role_idx" ON "category" USING btree ("workspace","system_role");--> statement-breakpoint
INSERT INTO "category" ("workspace", "id", "name", "description", "color", "visible", "system_role") VALUES
  ('production', 'default', 'Без категорії', '', '#2f86a6', true, 'default'),
  ('production', 'planned_wtg', 'Основний кандидат', '', '#c67b18', true, 'main_candidate'),
  ('production', 'wtg', 'ВЕУ', '', '#2a9461', true, 'wtg_result'),
  ('production', 'alt_candidates', 'Альтернативний кандидат', '', '#8055a6', true, 'alternative_candidate'),
  ('production', 'roads', 'Дороги', '', '#66756d', true, 'road_result'),
  ('production', 'servitudes', 'Сервітути під ЛЕП', '', '#2f7990', true, 'servitude_result'),
  ('production', 'substations', 'Підстанції', '', '#a44f52', true, 'substation_result'),
  ('sandbox', 'default', 'Без категорії', '', '#2f86a6', true, 'default'),
  ('sandbox', 'planned_wtg', 'Основний кандидат', '', '#c67b18', true, 'main_candidate'),
  ('sandbox', 'wtg', 'ВЕУ', '', '#2a9461', true, 'wtg_result'),
  ('sandbox', 'alt_candidates', 'Альтернативний кандидат', '', '#8055a6', true, 'alternative_candidate'),
  ('sandbox', 'roads', 'Дороги', '', '#66756d', true, 'road_result'),
  ('sandbox', 'servitudes', 'Сервітути під ЛЕП', '', '#2f7990', true, 'servitude_result'),
  ('sandbox', 'substations', 'Підстанції', '', '#a44f52', true, 'substation_result')
ON CONFLICT ("workspace", "id") DO UPDATE SET "system_role" = EXCLUDED."system_role";--> statement-breakpoint
UPDATE "category" SET "name" = 'Основний кандидат' WHERE "id" = 'planned_wtg' AND "name" = 'Заплановано під ВЕУ';
