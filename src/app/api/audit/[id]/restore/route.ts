import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot, plotVersion } from "@/db/schema";
import { defaultCategories } from "@/data/demo";
import { getCurrentUser } from "@/lib/access";
import { auditValues, changedPlotFields, parseVersionSnapshot, versionSnapshot } from "@/lib/audit";
import { featureToPlotValues, parsePlotFeature, plotRowToFeature } from "@/lib/plots";
import { hasPermission } from "@/lib/permissions";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "versions.restore")) return NextResponse.json({ error: "Відновлення версій доступне лише адміністратору." }, { status: 403 });

  try {
    const workspace = await getDataWorkspace();
    const { id } = await params;
    const [record] = await db.select({ entry: auditLog, version: plotVersion }).from(auditLog).innerJoin(plotVersion, and(eq(plotVersion.auditLogId, auditLog.id), eq(plotVersion.workspace, workspace))).where(and(eq(auditLog.workspace, workspace), eq(auditLog.id, id))).limit(1);
    if (!record) return NextResponse.json({ error: "Версію для відновлення не знайдено." }, { status: 404 });

    const stored = parseVersionSnapshot(record.version.snapshot); const feature = parsePlotFeature(stored.feature);
    if (feature.properties.id !== record.version.plotId) throw new Error("ID ділянки у версії не збігається.");
    const rows = await db.select().from(plot).where(eq(plot.workspace, workspace)); const current = rows.find((row) => row.id === feature.properties.id);
    const duplicate = rows.find((row) => row.id !== feature.properties.id && row.cadastralNumber === feature.properties.cadastralNumber);
    if (duplicate) return NextResponse.json({ error: "Відновлення створить дубль кадастрового номера." }, { status: 409 });
    const categoryId = feature.properties.category || "default"; const fallback = defaultCategories[categoryId] ?? { name: categoryId, color: "#2f86a6", visible: true };
    const currentFeature = current ? plotRowToFeature(current) : null; const changes = changedPlotFields(currentFeature, feature); const restoreAuditId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(category).values({ workspace, id: categoryId, ...fallback }).onConflictDoNothing({ target: [category.workspace, category.id] });
      const values = { ...featureToPlotValues(feature), pdfObjectKey: stored.pdfObjectKey };
      if (current) await tx.update(plot).set(values).where(and(eq(plot.workspace, workspace), eq(plot.id, feature.properties.id)));
      else await tx.insert(plot).values({ ...values, workspace });
      await tx.insert(auditLog).values({ id: restoreAuditId, ...auditValues(currentUser, workspace, { action: "plot.restored", entityType: "plot", entityId: feature.properties.id, cadastralNumber: feature.properties.cadastralNumber, summary: `Відновлено попередній стан ділянки ${feature.properties.cadastralNumber}.`, details: { changes, source: "restore", restoredFromAuditId: id, restoredAction: record.entry.action } }) });
      if (current) await tx.insert(plotVersion).values({ workspace, plotId: current.id, auditLogId: restoreAuditId, action: "plot.restored", snapshot: versionSnapshot(current), createdBy: currentUser.id });
    });

    const [saved] = await db.select().from(plot).where(and(eq(plot.workspace, workspace), eq(plot.id, feature.properties.id))).limit(1);
    return NextResponse.json({ plot: plotRowToFeature(saved), auditId: restoreAuditId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося відновити версію." }, { status: 400 });
  }
}
