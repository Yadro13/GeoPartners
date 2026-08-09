import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, plot, plotStatus, resultStatusProgress } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { auditValues } from "@/lib/audit";
import { getDataWorkspace } from "@/lib/data-workspace";
import { hasPermission } from "@/lib/permissions";
import { parsePlotResultLinks, type PlotResultType } from "@/lib/plot-result-links";
import { normalizeResultNumber, parseResultStatusProgress, resultProgressContextKey, withoutResultExpenses } from "@/lib/result-status-progress";

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "plots.update")) return NextResponse.json({ error: "Недостатньо прав для редагування етапів." }, { status: 403 });

  try {
    const workspace = await getDataWorkspace();
    const body = await request.json() as { resultType?: PlotResultType; resultNumber?: string; progress?: unknown[] };
    const requestedNumber = typeof body.resultNumber === "string" ? body.resultNumber.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    const parsed = parseResultStatusProgress((body.progress ?? []).map((entry) => ({ ...(entry && typeof entry === "object" ? entry : {}), resultType: body.resultType, resultNumber: requestedNumber })));
    if (!body.resultType || !requestedNumber) throw new Error("Вкажіть тип і номер результату.");

    const plotRows = await db.select({ resultLinks: plot.resultLinks }).from(plot).where(eq(plot.workspace, workspace));
    const requestedKey = resultProgressContextKey(body.resultType, requestedNumber);
    const actualLink = plotRows.flatMap(({ resultLinks }) => parsePlotResultLinks(resultLinks)).find((link) => resultProgressContextKey(link.type, link.number) === requestedKey);
    if (!actualLink) return NextResponse.json({ error: "Цей результат більше не пов'язаний із жодною ділянкою." }, { status: 409 });
    const storedNumber = normalizeResultNumber(actualLink.number);

    const statuses = await db.select({ id: plotStatus.id }).from(plotStatus).where(and(eq(plotStatus.workspace, workspace), eq(plotStatus.scope, body.resultType))).orderBy(asc(plotStatus.sortOrder));
    const statusIds = new Set(statuses.map(({ id }) => id));
    if (parsed.some(({ statusId }) => !statusIds.has(statusId))) throw new Error("Оберіть етапи з довідника цього напряму робіт.");

    const previousRows = await db.select().from(resultStatusProgress).where(and(eq(resultStatusProgress.workspace, workspace), eq(resultStatusProgress.resultType, body.resultType), eq(resultStatusProgress.resultNumber, storedNumber)));
    const previousCosts = new Map(previousRows.map(({ statusId, cost }) => [statusId, cost === null ? null : Number(cost)]));
    const entries = parsed.map((entry) => ({ ...entry, resultNumber: storedNumber, cost: hasPermission(currentUser, "expenses.manage") ? entry.cost : previousCosts.get(entry.statusId) ?? null }));

    await db.transaction(async (tx) => {
      await tx.delete(resultStatusProgress).where(and(eq(resultStatusProgress.workspace, workspace), eq(resultStatusProgress.resultType, body.resultType!), eq(resultStatusProgress.resultNumber, storedNumber)));
      if (entries.length) await tx.insert(resultStatusProgress).values(entries.map((entry) => ({ workspace, resultType: entry.resultType, resultNumber: entry.resultNumber, statusId: entry.statusId, completedAt: new Date(entry.completedAt), cost: entry.cost === null ? null : String(entry.cost) })));
      await tx.insert(auditLog).values(auditValues(currentUser, workspace, {
        action: "result-status-progress.updated",
        entityType: "result",
        entityId: `${body.resultType}:${storedNumber}`,
        summary: `Оновлено етапи ${body.resultType} № ${actualLink.number}.`,
        details: { resultType: body.resultType, resultNumber: actualLink.number, before: previousRows.map(({ statusId, completedAt, cost }) => ({ statusId, completedAt, cost })), after: entries },
      }));
    });

    const response = entries.map((entry) => ({ ...entry, completedAt: new Date(entry.completedAt).toISOString() }));
    return NextResponse.json(hasPermission(currentUser, "expenses.view") ? response : withoutResultExpenses(response));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося зберегти етапи результату." }, { status: 400 });
  }
}
