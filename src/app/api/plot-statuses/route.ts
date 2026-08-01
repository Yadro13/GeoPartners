import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, plot, plotStatus } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { auditValues } from "@/lib/audit";
import { getDataWorkspace } from "@/lib/data-workspace";
import { hasPermission } from "@/lib/permissions";
import { parsePlotStatusDefinitions } from "@/lib/plot-status-directory";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  const workspace = await getDataWorkspace();
  const rows = await db.select({ id: plotStatus.id, name: plotStatus.name }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.sortOrder));
  return NextResponse.json(rows);
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "statuses.manage")) return NextResponse.json({ error: "Керування довідником статусів доступне лише адміністратору." }, { status: 403 });

  try {
    const workspace = await getDataWorkspace();
    const entries = parsePlotStatusDefinitions(await request.json());
    await db.transaction(async (tx) => {
      const previous = await tx.select({ id: plotStatus.id, name: plotStatus.name }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.sortOrder));
      const nextIds = new Set(entries.map(({ id }) => id));

      const plots = await tx.select({ id: plot.id, status: plot.status, statusProgress: plot.statusProgress }).from(plot).where(eq(plot.workspace, workspace));
      for (const item of plots) {
        const statusProgress = item.statusProgress.filter(({ statusId }) => nextIds.has(statusId));
        const completedIds = new Set(statusProgress.map(({ statusId }) => statusId));
        const currentStatus = [...entries].reverse().find(({ id }) => completedIds.has(id))?.name ?? "";
        if (statusProgress.length !== item.statusProgress.length || currentStatus !== item.status) {
          await tx.update(plot).set({ status: currentStatus, statusProgress }).where(and(eq(plot.workspace, workspace), eq(plot.id, item.id)));
        }
      }

      await tx.delete(plotStatus).where(eq(plotStatus.workspace, workspace));
      if (entries.length) {
        await tx.insert(plotStatus).values(entries.map((item, sortOrder) => ({ workspace, ...item, sortOrder })));
      }

      await tx.insert(auditLog).values(auditValues(currentUser, workspace, {
        action: "plot-statuses.updated",
        entityType: "settings",
        entityId: "plot-statuses",
        summary: "Оновлено довідник статусів ділянок.",
        details: { before: previous, after: entries },
      }));
    });
    return NextResponse.json(entries);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося зберегти довідник статусів." }, { status: 400 });
  }
}
