import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { workspaceSnapshot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { getDataWorkspace } from "@/lib/data-workspace";
import { snapshotMetadata } from "@/lib/workspace-snapshots";

const idSchema = z.uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) return NextResponse.json({ error: "Некоректний ідентифікатор знімка." }, { status: 400 });
  const workspace = await getDataWorkspace();
  const [snapshot] = await db.select().from(workspaceSnapshot).where(and(eq(workspaceSnapshot.id, parsedId.data), eq(workspaceSnapshot.workspace, workspace))).limit(1);
  if (!snapshot) return NextResponse.json({ error: "Знімок не знайдено." }, { status: 404 });
  return NextResponse.json({ ...snapshotMetadata(snapshot), payload: snapshot.payload }, { headers: { "cache-control": "no-store" } });
}
