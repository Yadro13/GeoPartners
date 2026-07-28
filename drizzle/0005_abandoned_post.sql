CREATE TABLE "plot_status" (
	"workspace" "data_workspace" DEFAULT 'production' NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plot_status_workspace_id_pk" PRIMARY KEY("workspace","id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plot_status_workspace_name_idx" ON "plot_status" USING btree ("workspace","name");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_status_workspace_sort_idx" ON "plot_status" USING btree ("workspace","sort_order");--> statement-breakpoint
INSERT INTO "plot_status" ("workspace", "id", "name", "sort_order")
SELECT workspace::"data_workspace", id, name, sort_order
FROM (VALUES ('production'), ('sandbox')) AS workspaces(workspace)
CROSS JOIN (VALUES
	('status_01', 'обрана ділянка як варіант', 0),
	('status_02', 'проведено перемовини з власником', 1),
	('status_03', 'отримана згода власника', 2),
	('status_04', 'проведено перемовини з орендарем', 3),
	('status_05', 'отримано усну згоду орендаря', 4),
	('status_06', 'отримано письмову згоду орендаря', 5),
	('status_07', 'отримано схему поділу ділянки', 6),
	('status_08', 'на виправленні помилок в ДЗК', 7),
	('status_09', 'передано землевпоряднику на поділ', 8),
	('status_10', 'поділ ділянки на реєстрації', 9),
	('status_11', 'нові ділянки на реєстрації права власності', 10),
	('status_12', 'підписано угоду про розірвання оренди', 11),
	('status_13', 'угода про розірвання оренди на реєстрації', 12),
	('status_14', 'передано нотаріусу для угоди', 13),
	('status_15', 'ділянка під ВЕУ викуплена', 14)
) AS statuses(id, name, sort_order);
