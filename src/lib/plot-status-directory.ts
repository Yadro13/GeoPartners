import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plotStatus } from "@/db/schema";
import type { DataWorkspace } from "@/lib/data-workspace";
import { plotStatusScopes, type PlotStatusDefinition, type PlotStatusScope } from "@/data/plot-statuses";
import type { PlotStatusProgress } from "@/lib/plot-status-progress";

export async function getPlotStatuses(workspace: DataWorkspace): Promise<PlotStatusDefinition[]> {
  const rows = await db
    .select({ id: plotStatus.id, name: plotStatus.name, scope: plotStatus.scope })
    .from(plotStatus)
    .where(eq(plotStatus.workspace, workspace))
    .orderBy(asc(plotStatus.scope), asc(plotStatus.sortOrder));
  return rows;
}

export async function resolvePlotStatusProgress(workspace: DataWorkspace, progress: PlotStatusProgress[], legacyStatus = "", fallbackDate = new Date()) {
  const statuses = await getPlotStatuses(workspace);
  const knownIds = new Set(statuses.filter(({ scope }) => scope === "plots").map(({ id }) => id));
  if (progress.some(({ statusId }) => !knownIds.has(statusId))) throw new Error("Оберіть етапи з чинного довідника.");
  if (progress.length) {
    const completedIds = new Set(progress.map(({ statusId }) => statusId));
    return { progress, currentStatus: [...statuses].reverse().find(({ id }) => completedIds.has(id))?.name ?? "" };
  }
  if (!legacyStatus) return { progress, currentStatus: "" };

  const legacy = statuses.find(({ name }) => name === legacyStatus);
  if (!legacy) throw new Error("Оберіть етапи з чинного довідника.");
  return { progress: [{ statusId: legacy.id, completedAt: fallbackDate.toISOString(), cost: null }], currentStatus: legacy.name };
}

export function parsePlotStatusDefinitions(value: unknown): PlotStatusDefinition[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Некоректний список статусів.");
  const entries = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Некоректний запис статусу.");
    const candidate = item as Partial<PlotStatusDefinition>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim().replace(/\s+/g, " ") : "";
    const scope = typeof candidate.scope === "string" && plotStatusScopes.includes(candidate.scope as PlotStatusScope) ? candidate.scope as PlotStatusScope : null;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Некоректний ідентифікатор статусу.");
    if (!name || name.length > 160) throw new Error("Назва статусу має містити від 1 до 160 символів.");
    if (!scope) throw new Error("Некоректний тип процесу для статусу.");
    return { id, name, scope };
  });
  if (new Set(entries.map(({ id }) => id)).size !== entries.length) throw new Error("Ідентифікатори статусів не мають повторюватися.");
  if (new Set(entries.map(({ scope, name }) => `${scope}:${name.toLocaleLowerCase("uk-UA")}`)).size !== entries.length) throw new Error("Назви статусів одного процесу не мають повторюватися.");
  return entries;
}
