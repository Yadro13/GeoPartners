import { createHash } from "node:crypto";
import type { PlotFeature } from "../components/workspace/types";
import type { CategoryDefinition } from "../data/demo";
import type { PlotStatusDefinition } from "../data/plot-statuses";
import type { DataWorkspace } from "./data-workspace";
import type { ResultStatusProgress } from "./result-status-progress";

export const workspaceSnapshotFormatVersion = 2 as const;
export type WorkspaceSnapshotSource = "manual" | "scheduled";

export type WorkspaceSnapshotPayload = {
  formatVersion: typeof workspaceSnapshotFormatVersion;
  workspace: DataWorkspace;
  capturedAt: string;
  categories: Record<string, CategoryDefinition>;
  plotStatuses: PlotStatusDefinition[];
  resultStatusProgress?: ResultStatusProgress[];
  plots: PlotFeature[];
};

export function buildWorkspaceSnapshotPayload(input: Omit<WorkspaceSnapshotPayload, "formatVersion" | "capturedAt"> & { capturedAt: Date | string }): WorkspaceSnapshotPayload {
  return {
    formatVersion: workspaceSnapshotFormatVersion,
    workspace: input.workspace,
    capturedAt: typeof input.capturedAt === "string" ? new Date(input.capturedAt).toISOString() : input.capturedAt.toISOString(),
    categories: input.categories,
    plotStatuses: input.plotStatuses,
    resultStatusProgress: input.resultStatusProgress ?? [],
    plots: input.plots,
  };
}

export function hashWorkspaceSnapshot(payload: WorkspaceSnapshotPayload) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
