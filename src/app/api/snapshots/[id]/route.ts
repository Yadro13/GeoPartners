import { and, desc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { workspaceSnapshot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { getDataWorkspace } from "@/lib/data-workspace";
import { snapshotMetadata } from "@/lib/workspace-snapshots";
import { hashWorkspaceSnapshot } from "@/lib/workspace-snapshot-format";
import { buildSnapshotKpis } from "@/lib/snapshot-report";
import { hasPermission } from "@/lib/permissions";

const idSchema = z.uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "snapshots.view")) return NextResponse.json({ error: "Історичні знімки доступні лише адміністратору." }, { status: 403 });
  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) return NextResponse.json({ error: "Некоректний ідентифікатор знімка." }, { status: 400 });
  const workspace = await getDataWorkspace();
  const [snapshot] = await db.select().from(workspaceSnapshot).where(and(eq(workspaceSnapshot.id, parsedId.data), eq(workspaceSnapshot.workspace, workspace))).limit(1);
  if (!snapshot) return NextResponse.json({ error: "Знімок не знайдено." }, { status: 404 });
  if (hashWorkspaceSnapshot(snapshot.payload) !== snapshot.contentHash) return NextResponse.json({ error: "Контроль цілісності знімка не пройдено." }, { status: 409 });
  const [previous] = await db.select().from(workspaceSnapshot).where(and(eq(workspaceSnapshot.workspace, workspace), lt(workspaceSnapshot.capturedAt, snapshot.capturedAt))).orderBy(desc(workspaceSnapshot.capturedAt)).limit(1);
  return NextResponse.json({
    ...snapshotMetadata(snapshot),
    payload: snapshot.payload,
    previous: previous ? snapshotMetadata(previous) : null,
    kpis: buildSnapshotKpis(snapshot.payload, previous?.payload ?? null),
  }, { headers: { "cache-control": "no-store" } });
}
