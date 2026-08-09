CREATE TABLE "result_status_progress" (
	"workspace" "data_workspace" DEFAULT 'production' NOT NULL,
	"result_type" text NOT NULL,
	"result_number" text NOT NULL,
	"status_id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"cost" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_status_progress_pk" PRIMARY KEY("workspace","result_type","result_number","status_id")
);
--> statement-breakpoint
DROP INDEX "plot_status_workspace_name_idx";--> statement-breakpoint
DROP INDEX "plot_status_workspace_sort_idx";--> statement-breakpoint
ALTER TABLE "plot_status" ADD COLUMN "scope" text DEFAULT 'plots' NOT NULL;--> statement-breakpoint
INSERT INTO "plot_status" ("workspace", "id", "scope", "name", "sort_order")
SELECT workspaces.workspace, definitions.id, definitions.scope, definitions.name, definitions.sort_order
FROM (VALUES ('production'::"data_workspace"), ('sandbox'::"data_workspace")) AS workspaces(workspace)
CROSS JOIN (VALUES
  ('wtg_status_01', 'wtg', 'обрана ділянка як варіант', 0),
  ('wtg_status_02', 'wtg', 'проведено перемовини з власником', 1),
  ('wtg_status_03', 'wtg', 'отримана згода власника', 2),
  ('wtg_status_04', 'wtg', 'проведено перемовини з орендарем', 3),
  ('wtg_status_05', 'wtg', 'отримано усну згоду орендаря', 4),
  ('wtg_status_06', 'wtg', 'отримано письмову згоду орендаря', 5),
  ('wtg_status_07', 'wtg', 'отримано схему поділу ділянки', 6),
  ('wtg_status_08', 'wtg', 'на виправленні помилок в ДЗК', 7),
  ('wtg_status_09', 'wtg', 'передано землевпоряднику на поділ', 8),
  ('wtg_status_10', 'wtg', 'поділ ділянки на реєстрації', 9),
  ('wtg_status_11', 'wtg', 'нові ділянки на реєстрації права власності', 10),
  ('wtg_status_12', 'wtg', 'підписано угоду про розірвання оренди', 11),
  ('wtg_status_13', 'wtg', 'угода про розірвання оренди на реєстрації', 12),
  ('wtg_status_14', 'wtg', 'передано нотаріусу для угоди', 13),
  ('wtg_status_15', 'wtg', 'ділянка під ВЕУ викуплена', 14),
  ('wtg_status_16', 'wtg', 'розробка проекту щодо зміни ЦП', 15),
  ('wtg_status_17', 'wtg', 'рішення сесії про зміну ЦП', 16),
  ('wtg_status_18', 'wtg', 'зміна ЦП зареєстрована', 17),
  ('road_status_01', 'road', 'обрана ділянка як варіант', 0),
  ('road_status_02', 'road', 'проведено перемовини з власником', 1),
  ('road_status_03', 'road', 'отримана згода власника', 2),
  ('road_status_04', 'road', 'проведено перемовини з орендарем', 3),
  ('road_status_05', 'road', 'отримано усну згоду орендаря', 4),
  ('road_status_06', 'road', 'отримано письмову згоду орендаря', 5),
  ('road_status_07', 'road', 'отримано схему поділу ділянки', 6),
  ('road_status_08', 'road', 'на виправленні помилок в ДЗК', 7),
  ('road_status_09', 'road', 'передано землевпоряднику на поділ', 8),
  ('road_status_10', 'road', 'передано землевпоряднику для формування (для ком. вл.)', 9),
  ('road_status_11', 'road', 'поділ ділянки на реєстрації', 10),
  ('road_status_12', 'road', 'ділянка на реєстрації (для ком. вл.)', 11),
  ('road_status_13', 'road', 'нові ділянки на реєстрації права власності', 12),
  ('road_status_14', 'road', 'ТД щодо формування ділянки на затвердженні (для ком. вл.)', 13),
  ('road_status_15', 'road', 'підписано угоду про розірвання оренди', 14),
  ('road_status_16', 'road', 'угода про розірвання оренди на реєстрації', 15),
  ('road_status_17', 'road', 'передано нотаріусу для угоди', 16),
  ('road_status_18', 'road', 'ділянка під ВЕУ викуплена', 17),
  ('road_status_19', 'road', 'розробка проекту щодо зміни ЦП', 18),
  ('road_status_20', 'road', 'рішення сесії про зміну ЦП', 19),
  ('road_status_21', 'road', 'зміна ЦП зареєстрована', 20),
  ('road_status_22', 'road', 'договір оренди на підписанні (для ком. вл.)', 21),
  ('road_status_23', 'road', 'договір оренди зареєстровано (для ком. вл.)', 22),
  ('servitude_status_01', 'servitude', 'обрана ділянка як варіант', 0),
  ('servitude_status_02', 'servitude', 'проведено перемовини з власником', 1),
  ('servitude_status_03', 'servitude', 'отримана згода власника', 2),
  ('servitude_status_04', 'servitude', 'проведено перемовини з орендарем', 3),
  ('servitude_status_05', 'servitude', 'отримано усну згоду орендаря', 4),
  ('servitude_status_06', 'servitude', 'отримано схему поділу ділянки', 5),
  ('servitude_status_07', 'servitude', 'на виправленні помилок в ДЗК', 6),
  ('servitude_status_08', 'servitude', 'підписано договір сервітуту', 7),
  ('servitude_status_09', 'servitude', 'передано землевпоряднику на виготовлення ТД', 8),
  ('servitude_status_10', 'servitude', 'ТД на погодженні', 9),
  ('servitude_status_11', 'servitude', 'ТД на реєстрації', 10),
  ('servitude_status_12', 'servitude', 'договір сервітуту зареєстровано', 11),
  ('substation_status_01', 'substation', 'обрана ділянка як варіант', 0),
  ('substation_status_02', 'substation', 'проведено перемовини з власником', 1),
  ('substation_status_03', 'substation', 'отримана згода власника', 2),
  ('substation_status_04', 'substation', 'проведено перемовини з орендарем', 3),
  ('substation_status_05', 'substation', 'отримано усну згоду орендаря', 4),
  ('substation_status_06', 'substation', 'отримано письмову згоду орендаря', 5),
  ('substation_status_07', 'substation', 'отримано схему поділу ділянки', 6),
  ('substation_status_08', 'substation', 'на виправленні помилок в ДЗК', 7),
  ('substation_status_09', 'substation', 'передано землевпоряднику на поділ', 8),
  ('substation_status_10', 'substation', 'поділ ділянки на реєстрації', 9),
  ('substation_status_11', 'substation', 'нові ділянки на реєстрації права власності', 10),
  ('substation_status_12', 'substation', 'підписано угоду про розірвання оренди', 11),
  ('substation_status_13', 'substation', 'угода про розірвання оренди на реєстрації', 12),
  ('substation_status_14', 'substation', 'передано нотаріусу для угоди', 13),
  ('substation_status_15', 'substation', 'ділянка під ВЕУ викуплена', 14),
  ('substation_status_16', 'substation', 'розробка проекту щодо зміни ЦП', 15),
  ('substation_status_17', 'substation', 'рішення сесії про зміну ЦП', 16),
  ('substation_status_18', 'substation', 'зміна ЦП зареєстрована', 17)
) AS definitions(id, scope, name, sort_order)
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "result_status_progress" ADD CONSTRAINT "result_status_progress_status_fk" FOREIGN KEY ("workspace","status_id") REFERENCES "public"."plot_status"("workspace","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_status_progress_context_idx" ON "result_status_progress" USING btree ("workspace","result_type","result_number");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_status_workspace_scope_name_idx" ON "plot_status" USING btree ("workspace","scope","name");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_status_workspace_scope_sort_idx" ON "plot_status" USING btree ("workspace","scope","sort_order");
--> statement-breakpoint
INSERT INTO "result_status_progress" ("workspace", "result_type", "result_number", "status_id", "completed_at", "cost")
SELECT
  p."workspace",
  link->>'type',
  lower(regexp_replace(trim(link->>'number'), '\s+', ' ', 'g')),
  (link->>'type') || '_' || (progress->>'statusId'),
  (progress->>'completedAt')::timestamptz,
  NULLIF(progress->>'cost', '')::numeric
FROM "plot" AS p
JOIN "category" AS c ON c."workspace" = p."workspace" AND c."id" = p."category_id" AND c."system_role" = 'main_candidate'
CROSS JOIN LATERAL jsonb_array_elements(p."result_links") AS link
CROSS JOIN LATERAL jsonb_array_elements(p."status_progress") AS progress
JOIN "plot_status" AS s ON s."workspace" = p."workspace" AND s."id" = (link->>'type') || '_' || (progress->>'statusId')
WHERE link->>'type' IN ('wtg', 'road', 'servitude', 'substation')
  AND COALESCE(link->>'number', '') <> ''
  AND progress->>'statusId' ~ '^status_[0-9]{2}$'
ON CONFLICT DO NOTHING;
