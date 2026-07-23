import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, plotVersion } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  const workspace = await getDataWorkspace();

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30));
  const scope = searchParams.get("scope") ?? "all";
  const query = searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const conditions: SQL[] = [eq(auditLog.workspace, workspace)];

  if (scope === "import") conditions.push(eq(auditLog.action, "import.completed"));
  if (scope === "plots") conditions.push(or(eq(auditLog.action, "plot.created"), eq(auditLog.action, "plot.updated"), eq(auditLog.action, "plot.deleted"), eq(auditLog.action, "plot.restored"))!);
  if (query) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(or(ilike(auditLog.summary, pattern), ilike(auditLog.cadastralNumber, pattern), ilike(auditLog.actorName, pattern), ilike(auditLog.actorEmail, pattern))!);
  }

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db.select({ entry: auditLog, versionId: plotVersion.id }).from(auditLog).leftJoin(plotVersion, and(eq(plotVersion.auditLogId, auditLog.id), eq(plotVersion.workspace, workspace))).where(where).orderBy(desc(auditLog.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(where),
  ]);
  const items = rows.map(({ entry, versionId }) => ({ ...entry, canRestore: Boolean(versionId) }));
  return NextResponse.json({ items, total: countRows[0]?.count ?? 0, page, limit }, { headers: { "cache-control": "no-store" } });
}
