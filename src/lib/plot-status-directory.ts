import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plotStatus } from "@/db/schema";
import type { DataWorkspace } from "@/lib/data-workspace";
import type { PlotStatusDefinition } from "@/data/plot-statuses";

export async function getPlotStatuses(workspace: DataWorkspace): Promise<PlotStatusDefinition[]> {
  const rows = await db
    .select({ id: plotStatus.id, name: plotStatus.name })
    .from(plotStatus)
    .where(eq(plotStatus.workspace, workspace))
    .orderBy(asc(plotStatus.sortOrder));
  return rows;
}

export async function assertKnownPlotStatus(workspace: DataWorkspace, name: string) {
  if (!name) return;
  const [record] = await db
    .select({ id: plotStatus.id })
    .from(plotStatus)
    .where(and(eq(plotStatus.workspace, workspace), eq(plotStatus.name, name)))
    .limit(1);
  if (!record) throw new Error("Оберіть статус із чинного довідника.");
}

export function parsePlotStatusDefinitions(value: unknown): PlotStatusDefinition[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Некоректний список статусів.");
  const entries = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Некоректний запис статусу.");
    const candidate = item as Partial<PlotStatusDefinition>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim().replace(/\s+/g, " ") : "";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Некоректний ідентифікатор статусу.");
    if (!name || name.length > 160) throw new Error("Назва статусу має містити від 1 до 160 символів.");
    return { id, name };
  });
  if (new Set(entries.map(({ id }) => id)).size !== entries.length) throw new Error("Ідентифікатори статусів не мають повторюватися.");
  if (new Set(entries.map(({ name }) => name.toLocaleLowerCase("uk-UA"))).size !== entries.length) throw new Error("Назви статусів не мають повторюватися.");
  return entries;
}
