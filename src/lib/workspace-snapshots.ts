import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot, plotStatus, workspaceSnapshot } from "@/db/schema";
import { auditValues } from "@/lib/audit";
import type { DataWorkspace } from "@/lib/data-workspace";
import { categoryRowsToRecord, plotRowToFeature } from "@/lib/plots";
import { buildWorkspaceSnapshotPayload, hashWorkspaceSnapshot, workspaceSnapshotFormatVersion, type WorkspaceSnapshotSource } from "@/lib/workspace-snapshot-format";

type SnapshotActor = { id: string; name: string; email: string };

export async function captureWorkspaceSnapshot({ workspace, actor = null, source = "manual", capturedAt = new Date() }: { workspace: DataWorkspace; actor?: SnapshotActor | null; source?: WorkspaceSnapshotSource; capturedAt?: Date }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    const categoryRows = await tx.select().from(category).where(eq(category.workspace, workspace)).orderBy(asc(category.id));
    const statusRows = await tx.select({ id: plotStatus.id, name: plotStatus.name }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.sortOrder));
    const plotRows = await tx.select().from(plot).where(eq(plot.workspace, workspace)).orderBy(asc(plot.id));
    const payload = buildWorkspaceSnapshotPayload({
      workspace,
      capturedAt,
      categories: categoryRowsToRecord(categoryRows),
      plotStatuses: statusRows,
      plots: plotRows.map(plotRowToFeature),
    });
    const contentHash = hashWorkspaceSnapshot(payload);
    const [snapshot] = await tx.insert(workspaceSnapshot).values({
      workspace,
      source,
      formatVersion: workspaceSnapshotFormatVersion,
      payload,
      contentHash,
      plotCount: payload.plots.length,
      categoryCount: categoryRows.length,
      statusCount: statusRows.length,
      capturedBy: actor?.id ?? null,
      capturedAt,
    }).returning();
    const auditInput = {
      action: "workspace.snapshot.created",
      entityType: "workspace-snapshot",
      entityId: snapshot.id,
      summary: `Створено знімок ${workspace === "sandbox" ? "тестової" : "робочої"} бази.`,
      details: { source, contentHash, plots: payload.plots.length, categories: categoryRows.length, statuses: statusRows.length },
    } as const;
    await tx.insert(auditLog).values(actor ? auditValues(actor, workspace, auditInput) : {
      workspace,
      actorUserId: null,
      actorName: "GeoPartners",
      actorEmail: "system",
      ...auditInput,
    });
    return snapshot;
  });
}

export function snapshotMetadata(snapshot: typeof workspaceSnapshot.$inferSelect) {
  return {
    id: snapshot.id,
    workspace: snapshot.workspace,
    source: snapshot.source,
    formatVersion: snapshot.formatVersion,
    contentHash: snapshot.contentHash,
    plotCount: snapshot.plotCount,
    categoryCount: snapshot.categoryCount,
    statusCount: snapshot.statusCount,
    capturedAt: snapshot.capturedAt,
  };
}
