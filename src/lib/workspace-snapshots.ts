import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot, plotStatus, workspaceSnapshot } from "@/db/schema";
import { auditValues } from "@/lib/audit";
import type { DataWorkspace } from "@/lib/data-workspace";
import { categoryRowsToRecord, plotRowToFeature } from "@/lib/plots";
import { buildWorkspaceSnapshotPayload, hashWorkspaceSnapshot, workspaceSnapshotFormatVersion, type WorkspaceSnapshotSource } from "@/lib/workspace-snapshot-format";
import { getKyivSnapshotSchedule, snapshotRetentionCutoff } from "@/lib/snapshot-schedule";

type SnapshotActor = { id: string; name: string; email: string };

export async function captureWorkspaceSnapshot({ workspace, actor = null, source = "manual", capturedAt = new Date(), scheduleKey = null }: { workspace: DataWorkspace; actor?: SnapshotActor | null; source?: WorkspaceSnapshotSource; capturedAt?: Date; scheduleKey?: string | null }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    if (scheduleKey) {
      const [existing] = await tx.select().from(workspaceSnapshot).where(and(eq(workspaceSnapshot.workspace, workspace), eq(workspaceSnapshot.scheduleKey, scheduleKey!))).limit(1);
      if (existing) return { snapshot: existing, created: false };
    }
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
      scheduleKey,
      capturedBy: actor?.id ?? null,
      capturedAt,
    }).onConflictDoNothing({ target: [workspaceSnapshot.workspace, workspaceSnapshot.scheduleKey] }).returning();
    if (!snapshot) {
      const [existing] = await tx.select().from(workspaceSnapshot).where(and(eq(workspaceSnapshot.workspace, workspace), eq(workspaceSnapshot.scheduleKey, scheduleKey!))).limit(1);
      if (!existing) throw new Error("Scheduled snapshot conflict could not be resolved.");
      return { snapshot: existing, created: false };
    }
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
    return { snapshot, created: true };
  });
}

export async function runWorkspaceSnapshotSchedule({ now = new Date(), force = false }: { now?: Date; force?: boolean } = {}) {
  const schedule = getKyivSnapshotSchedule(now);
  if (!force && !schedule.due) return { due: false, scheduleKey: schedule.scheduleKey, created: [], deleted: 0 };
  const created: Array<{ workspace: DataWorkspace; id: string; created: boolean }> = [];
  for (const workspace of ["production", "sandbox"] as const) {
    const result = await captureWorkspaceSnapshot({
      workspace,
      source: "scheduled",
      capturedAt: now,
      scheduleKey: force ? null : schedule.scheduleKey,
    });
    created.push({ workspace, id: result.snapshot.id, created: result.created });
  }
  const removed = await db.delete(workspaceSnapshot).where(lt(workspaceSnapshot.capturedAt, snapshotRetentionCutoff(now))).returning({ id: workspaceSnapshot.id });
  return { due: true, scheduleKey: schedule.scheduleKey, created, deleted: removed.length };
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
    scheduleKey: snapshot.scheduleKey,
    capturedAt: snapshot.capturedAt,
  };
}
