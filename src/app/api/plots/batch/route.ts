import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot, plotVersion } from "@/db/schema";
import { defaultCategories } from "@/data/demo";
import { getCurrentUser } from "@/lib/access";
import { auditValues, changedPlotFields, versionSnapshot } from "@/lib/audit";
import { getDataWorkspace } from "@/lib/data-workspace";
import { hasPermission } from "@/lib/permissions";
import { featureToPlotValues, parsePlotFeature, plotRowToFeature } from "@/lib/plots";
import { resolvePlotStatusProgress } from "@/lib/plot-status-directory";
import { plotForExpenseAccess, preservePlotExpenses } from "@/lib/plot-expenses";

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "plots.update")) return NextResponse.json({ error: "Недостатньо прав для редагування ділянок." }, { status: 403 });

  try {
    const payload = await request.json();
    if (!Array.isArray(payload) || payload.length < 2 || payload.length > 100) return NextResponse.json({ error: "Пакет має містити від 2 до 100 ділянок." }, { status: 400 });
    const features = payload.map(parsePlotFeature);
    if (new Set(features.map(({ properties }) => properties.id)).size !== features.length) return NextResponse.json({ error: "Пакет містить дублікати ID ділянок." }, { status: 400 });

    const workspace = await getDataWorkspace(currentUser.preferredWorkspace);
    const allRows = await db.select().from(plot).where(eq(plot.workspace, workspace));
    const currentById = new Map(allRows.map((row) => [row.id, row]));
    if (features.some(({ properties }) => !currentById.has(properties.id))) return NextResponse.json({ error: "Одну з пов'язаних ділянок не знайдено." }, { status: 404 });

    const mergedCadastral = new Map(allRows.map((row) => [row.id, row.cadastralNumber]));
    features.forEach(({ properties }) => mergedCadastral.set(properties.id, properties.cadastralNumber));
    if (new Set(mergedCadastral.values()).size !== mergedCadastral.size) return NextResponse.json({ error: "Ділянка з таким кадастровим номером уже існує." }, { status: 409 });

    for (const feature of features) {
      const current = currentById.get(feature.properties.id)!;
      if (!hasPermission(currentUser, "expenses.manage")) {
        const preserved = preservePlotExpenses(feature, plotRowToFeature(current));
        feature.properties.statusProgress = preserved.properties.statusProgress;
      }
      const statusState = await resolvePlotStatusProgress(workspace, feature.properties.statusProgress ?? [], feature.properties.status ?? "", current.updatedAt);
      feature.properties.statusProgress = statusState.progress;
      feature.properties.status = statusState.currentStatus;
    }

    await db.transaction(async (tx) => {
      for (const feature of features) {
        const current = currentById.get(feature.properties.id)!;
        const categoryId = feature.properties.category || "default";
        const fallback = defaultCategories[categoryId] ?? { name: categoryId, description: "", color: "#2f86a6", visible: true };
        const auditId = crypto.randomUUID();
        await tx.insert(category).values({ workspace, id: categoryId, ...fallback }).onConflictDoNothing({ target: [category.workspace, category.id] });
        await tx.update(plot).set(featureToPlotValues(feature)).where(and(eq(plot.workspace, workspace), eq(plot.id, feature.properties.id)));
        await tx.insert(auditLog).values({ id: auditId, ...auditValues(currentUser, workspace, { action: "plot.updated", entityType: "plot", entityId: feature.properties.id, cadastralNumber: feature.properties.cadastralNumber, summary: `Оновлено зв'язки ділянки ${feature.properties.cadastralNumber}.`, details: { changes: changedPlotFields(plotRowToFeature(current), feature), source: "result_group" } }) });
        await tx.insert(plotVersion).values({ workspace, plotId: feature.properties.id, auditLogId: auditId, action: "plot.updated", snapshot: versionSnapshot(current), createdBy: currentUser.id });
      }
    });

    const canViewExpenses = hasPermission(currentUser, "expenses.view");
    return NextResponse.json(features.map((feature) => plotForExpenseAccess(feature, canViewExpenses)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Некоректні дані." }, { status: 400 });
  }
}
