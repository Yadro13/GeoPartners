import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, plot, plotStatus, resultStatusProgress } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { auditValues } from "@/lib/audit";
import { getDataWorkspace } from "@/lib/data-workspace";
import { hasPermission } from "@/lib/permissions";
import { parsePlotStatusDefinitions } from "@/lib/plot-status-directory";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  const workspace = await getDataWorkspace(currentUser.preferredWorkspace);
  const rows = await db.select({ id: plotStatus.id, name: plotStatus.name, scope: plotStatus.scope }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.scope), asc(plotStatus.sortOrder));
  return NextResponse.json(rows);
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "statuses.manage")) return NextResponse.json({ error: "Керування довідником статусів доступне лише адміністратору." }, { status: 403 });

  try {
    const workspace = await getDataWorkspace(currentUser.preferredWorkspace);
    const entries = parsePlotStatusDefinitions(await request.json());
    await db.transaction(async (tx) => {
      const previous = await tx.select({ id: plotStatus.id, name: plotStatus.name, scope: plotStatus.scope }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.scope), asc(plotStatus.sortOrder));
      const nextScopeById = new Map(entries.map(({ id, scope }) => [id, scope]));
      const plotEntries = entries.filter(({ scope }) => scope === "plots");
      const plotIds = new Set(plotEntries.map(({ id }) => id));
      const savedResultProgress = (await tx.select().from(resultStatusProgress).where(eq(resultStatusProgress.workspace, workspace))).filter(({ statusId, resultType }) => nextScopeById.get(statusId) === resultType);

      const plots = await tx.select({ id: plot.id, status: plot.status, statusProgress: plot.statusProgress }).from(plot).where(eq(plot.workspace, workspace));
      for (const item of plots) {
        const statusProgress = item.statusProgress.filter(({ statusId }) => plotIds.has(statusId));
        const completedIds = new Set(statusProgress.map(({ statusId }) => statusId));
        const currentStatus = [...plotEntries].reverse().find(({ id }) => completedIds.has(id))?.name ?? "";
        if (statusProgress.length !== item.statusProgress.length || currentStatus !== item.status) {
          await tx.update(plot).set({ status: currentStatus, statusProgress }).where(and(eq(plot.workspace, workspace), eq(plot.id, item.id)));
        }
      }

      await tx.delete(plotStatus).where(eq(plotStatus.workspace, workspace));
      if (entries.length) {
        const orderByScope = new Map<string, number>();
        await tx.insert(plotStatus).values(entries.map((item) => {
          const sortOrder = orderByScope.get(item.scope) ?? 0;
          orderByScope.set(item.scope, sortOrder + 1);
          return { workspace, ...item, sortOrder };
        }));
      }
      if (savedResultProgress.length) await tx.insert(resultStatusProgress).values(savedResultProgress);

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
