import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot, plotVersion } from "@/db/schema";
import { defaultCategories } from "@/data/demo";
import { getCurrentUser } from "@/lib/access";
import { featureToPlotValues, parsePlotFeature, plotRowToFeature } from "@/lib/plots";
import { findPlotConflicts } from "@/lib/geometry";
import { auditValues, changedPlotFields, versionSnapshot } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "plots.update")) return NextResponse.json({ error: "Недостатньо прав для редагування ділянки." }, { status: 403 });
  try {
    const workspace = await getDataWorkspace();
    const { id } = await params; const feature = parsePlotFeature(await request.json());
    if (feature.properties.id !== id) return NextResponse.json({ error: "ID ділянки не збігається." }, { status: 400 });
    const allRows = await db.select().from(plot).where(eq(plot.workspace, workspace)); const current = allRows.find((row) => row.id === id);
    if (!current) return NextResponse.json({ error: "Ділянку не знайдено." }, { status: 404 });
    const neighboringRows = allRows.filter((row) => row.id !== id);
    const duplicate = neighboringRows.find((row) => row.cadastralNumber === feature.properties.cadastralNumber);
    if (duplicate) return NextResponse.json({ error: "Ділянка з таким кадастровим номером уже існує." }, { status: 409 });
    const conflicts = findPlotConflicts(feature.geometry, neighboringRows.map(plotRowToFeature));
    if (conflicts.length) return NextResponse.json({ error: `Контур накладається на ${conflicts.length} сусідні ділянки.`, conflicts }, { status: 409 });
    const categoryId = feature.properties.category || "default"; const fallback = defaultCategories[categoryId] ?? { name: categoryId, color: "#2f86a6", visible: true };
    const before = plotRowToFeature(current); const changes = changedPlotFields(before, feature);
    const auditId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(category).values({ workspace, id: categoryId, ...fallback }).onConflictDoNothing({ target: [category.workspace, category.id] });
      await tx.update(plot).set(featureToPlotValues(feature)).where(and(eq(plot.workspace, workspace), eq(plot.id, id)));
      await tx.insert(auditLog).values({ id: auditId, ...auditValues(currentUser, workspace, { action: "plot.updated", entityType: "plot", entityId: id, cadastralNumber: feature.properties.cadastralNumber, summary: `Оновлено ділянку ${feature.properties.cadastralNumber}.`, details: { changes, source: "manual" } }) });
      await tx.insert(plotVersion).values({ workspace, plotId: id, auditLogId: auditId, action: "plot.updated", snapshot: versionSnapshot(current), createdBy: currentUser.id });
    });
    return NextResponse.json(feature);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Некоректні дані." }, { status: 400 }); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "plots.delete")) return NextResponse.json({ error: "Видалення ділянок доступне лише адміністратору." }, { status: 403 });
  const workspace = await getDataWorkspace();
  const { id } = await params; const [record] = await db.select().from(plot).where(and(eq(plot.workspace, workspace), eq(plot.id, id))).limit(1);
  if (!record) return NextResponse.json({ error: "Ділянку не знайдено." }, { status: 404 });
  const feature = plotRowToFeature(record);
  const auditId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.delete(plot).where(and(eq(plot.workspace, workspace), eq(plot.id, id)));
    await tx.insert(auditLog).values({ id: auditId, ...auditValues(currentUser, workspace, { action: "plot.deleted", entityType: "plot", entityId: id, cadastralNumber: record.cadastralNumber, summary: `Видалено ділянку ${record.cadastralNumber}.`, details: { changes: changedPlotFields(feature, null), source: "manual", name: record.name } }) });
    await tx.insert(plotVersion).values({ workspace, plotId: id, auditLogId: auditId, action: "plot.deleted", snapshot: versionSnapshot(record), createdBy: currentUser.id });
  });
  return new NextResponse(null, { status: 204 });
}
