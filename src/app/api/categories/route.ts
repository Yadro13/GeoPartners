import { NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { category, plot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import type { CategoryDefinition } from "@/data/demo";
import { hasPermission } from "@/lib/permissions";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "categories.manage")) return NextResponse.json({ error: "Недостатньо прав для керування категоріями." }, { status: 403 });
  const workspace = await getDataWorkspace();
  const value = await request.json() as Record<string, CategoryDefinition>;
  const entries = Object.entries(value).filter(([id, item]) => id && item?.name && /^#[0-9a-f]{6}$/i.test(item.color));
  if (!entries.some(([id]) => id === "default")) return NextResponse.json({ error: "Категорія default обов'язкова." }, { status: 400 });
  const ids = entries.map(([id]) => id);
  await db.transaction(async (tx) => {
    for (const [id, item] of entries) await tx.insert(category).values({ workspace, id, name: item.name, color: item.color, visible: item.visible }).onConflictDoUpdate({ target: [category.workspace, category.id], set: { name: item.name, color: item.color, visible: item.visible } });
    await tx.update(plot).set({ categoryId: "default" }).where(and(eq(plot.workspace, workspace), notInArray(plot.categoryId, ids)));
    await tx.delete(category).where(and(eq(category.workspace, workspace), notInArray(category.id, ids)));
  });
  return NextResponse.json(Object.fromEntries(entries));
}
