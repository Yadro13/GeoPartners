import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceSnapshot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { getDataWorkspace } from "@/lib/data-workspace";
import { hasPermission } from "@/lib/permissions";
import { snapshotMetadata } from "@/lib/workspace-snapshots";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "snapshots.view")) return NextResponse.json({ error: "Історичні знімки доступні лише адміністратору." }, { status: 403 });
  const workspace = await getDataWorkspace();
  const rows = await db.select().from(workspaceSnapshot).where(eq(workspaceSnapshot.workspace, workspace)).orderBy(desc(workspaceSnapshot.capturedAt)).limit(100);
  return NextResponse.json({ items: rows.map(snapshotMetadata) }, { headers: { "cache-control": "no-store" } });
}

export async function POST() {
  return NextResponse.json({ error: "Знімки створюються автоматично за розкладом." }, { status: 405, headers: { allow: "GET" } });
}
