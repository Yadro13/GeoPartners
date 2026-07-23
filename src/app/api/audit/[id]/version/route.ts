import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, plot, plotVersion } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { parseVersionSnapshot } from "@/lib/audit";
import { findPlotConflicts, validatePolygonGeometry } from "@/lib/geometry";
import { parsePlotFeature, plotRowToFeature } from "@/lib/plots";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });

  try {
    const workspace = await getDataWorkspace();
    const { id } = await params;
    const [record] = await db.select({ entry: auditLog, version: plotVersion }).from(auditLog).innerJoin(plotVersion, and(eq(plotVersion.auditLogId, auditLog.id), eq(plotVersion.workspace, workspace))).where(and(eq(auditLog.workspace, workspace), eq(auditLog.id, id))).limit(1);
    if (!record) return NextResponse.json({ error: "Версію для порівняння не знайдено." }, { status: 404 });
    const target = parsePlotFeature(parseVersionSnapshot(record.version.snapshot).feature);
    const rows = await db.select().from(plot).where(eq(plot.workspace, workspace)); const currentRow = rows.find((row) => row.id === target.properties.id); const current = currentRow ? plotRowToFeature(currentRow) : null;
    const validation = validatePolygonGeometry(target.geometry); const neighbors = rows.filter((row) => row.id !== target.properties.id).map(plotRowToFeature); const conflicts = findPlotConflicts(target.geometry, neighbors);
    const duplicate = rows.find((row) => row.id !== target.properties.id && row.cadastralNumber === target.properties.cadastralNumber);
    const blockingMessages = [
      ...validation.issues.filter(({ level }) => level === "error").map(({ message }) => message),
      ...(duplicate ? ["Кадастровий номер уже використовується іншою ділянкою."] : []),
    ];
    return NextResponse.json({ auditId: id, action: record.entry.action, current, target, validationIssues: validation.issues, conflicts, blockingMessages }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося підготувати порівняння." }, { status: 400 });
  }
}
