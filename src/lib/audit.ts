import type { PlotFeature } from "@/components/workspace/types";
import type { plot } from "@/db/schema";
import { plotRowToFeature } from "@/lib/plots";
import type { GeometryValidationIssue, PlotConflict } from "@/lib/geometry";
import type { DataWorkspace } from "@/lib/data-workspace";

export const auditActions = ["plot.created", "plot.updated", "plot.deleted", "plot.restored", "import.completed"] as const;
export type AuditAction = (typeof auditActions)[number];

export type AuditEntry = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  cadastralNumber: string | null;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string | Date;
  canRestore?: boolean;
};

export type VersionComparison = {
  auditId: string;
  action: AuditAction;
  current: PlotFeature | null;
  target: PlotFeature;
  validationIssues: GeometryValidationIssue[];
  conflicts: PlotConflict[];
  blockingMessages: string[];
};

type Actor = { id: string; name: string; email: string };
type AuditInput = Pick<AuditEntry, "action" | "entityType" | "summary"> & Partial<Pick<AuditEntry, "entityId" | "cadastralNumber" | "details">>;

export function auditValues(actor: Actor, workspace: DataWorkspace, input: AuditInput) {
  return {
    workspace,
    actorUserId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    cadastralNumber: input.cadastralNumber ?? null,
    summary: input.summary,
    details: input.details ?? {},
  };
}

const plotFieldLabels: Record<string, string> = {
  cadastralNumber: "Кадастровий номер",
  name: "Назва",
  category: "Категорія",
  areaHa: "Площа",
  projectCapacity: "Проєктна потужність",
  status: "Статус",
  mainCandidateCadastral: "Основний кандидат",
  owner: "Власник",
  lessee: "Орендар",
  geometry: "Контур",
  document: "Документ",
};

export function changedPlotFields(before: PlotFeature | null, after: PlotFeature | null) {
  if (!before && after) return ["Створено ділянку"];
  if (before && !after) return ["Видалено ділянку"];
  if (!before || !after) return [];
  const left = plotSnapshot(before); const right = plotSnapshot(after);
  return Object.keys(plotFieldLabels).filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map((key) => plotFieldLabels[key]);
}

type PlotRow = typeof plot.$inferSelect;

export function versionSnapshot(row: PlotRow) {
  return { feature: plotRowToFeature(row), pdfObjectKey: row.pdfObjectKey };
}

export function parseVersionSnapshot(value: unknown): { feature: PlotFeature; pdfObjectKey: string | null } {
  if (!value || typeof value !== "object" || !("feature" in value)) throw new Error("Збережена версія пошкоджена.");
  const snapshot = value as { feature: PlotFeature; pdfObjectKey?: unknown };
  return { feature: snapshot.feature, pdfObjectKey: typeof snapshot.pdfObjectKey === "string" ? snapshot.pdfObjectKey : null };
}

function plotSnapshot(plot: PlotFeature): Record<string, unknown> {
  const properties = plot.properties;
  return {
    cadastralNumber: properties.cadastralNumber,
    name: properties.name,
    category: properties.category,
    areaHa: properties.areaHa,
    projectCapacity: properties.projectCapacity,
    status: properties.status,
    mainCandidateCadastral: properties.mainCandidateCadastral,
    owner: properties.owner,
    lessee: properties.lessee,
    geometry: plot.geometry,
    document: properties.documentName ?? properties.hasDocument ?? false,
  };
}
