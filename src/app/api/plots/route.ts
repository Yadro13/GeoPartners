import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot } from "@/db/schema";
import { defaultCategories } from "@/data/demo";
import { getCurrentUser } from "@/lib/access";
import { featureToPlotValues, parsePlotFeature, plotRowToFeature } from "@/lib/plots";
import { auditValues, changedPlotFields } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "plots.create")) return NextResponse.json({ error: "Недостатньо прав для створення ділянки." }, { status: 403 });
  const workspace = await getDataWorkspace();
  return NextResponse.json((await db.select().from(plot).where(eq(plot.workspace, workspace))).map(plotRowToFeature));
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  try {
    const workspace = await getDataWorkspace();
    const feature = parsePlotFeature(await request.json());
    const existingRows = await db.select().from(plot).where(eq(plot.workspace, workspace));
    const existing = existingRows.find((row) => row.cadastralNumber === feature.properties.cadastralNumber);
    if (existing) return NextResponse.json({ error: "Ділянка з таким кадастровим номером уже існує." }, { status: 409 });
    const categoryId = feature.properties.category || "default";
    const fallback = defaultCategories[categoryId] ?? { name: categoryId, color: "#2f86a6", visible: true };
    await db.transaction(async (tx) => {
      await tx.insert(category).values({ workspace, id: categoryId, ...fallback }).onConflictDoNothing({ target: [category.workspace, category.id] });
      await tx.insert(plot).values({ ...featureToPlotValues(feature), workspace });
      await tx.insert(auditLog).values(auditValues(currentUser, workspace, { action: "plot.created", entityType: "plot", entityId: feature.properties.id, cadastralNumber: feature.properties.cadastralNumber, summary: `Створено ділянку ${feature.properties.cadastralNumber}.`, details: { changes: changedPlotFields(null, feature), source: "manual" } }));
    });
    return NextResponse.json(feature, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Некоректні дані." }, { status: 400 });
  }
}
