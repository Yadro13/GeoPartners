import { NextResponse } from "next/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { category, plot } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { defaultCategories, type CategoryDefinition } from "@/data/demo";
import { hasPermission } from "@/lib/permissions";
import { getDataWorkspace } from "@/lib/data-workspace";

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "categories.manage")) return NextResponse.json({ error: "Недостатньо прав для керування категоріями." }, { status: 403 });
  const workspace = await getDataWorkspace();
  const value = await request.json() as Record<string, CategoryDefinition>;
  const existingRows = await db.select({ id: category.id, systemRole: category.systemRole }).from(category).where(eq(category.workspace, workspace));
  const existingById = new Map(existingRows.map((item) => [item.id, item]));
  const requested = new Map(Object.entries(value).flatMap(([id, item]) => {
    const name = item?.name?.trim();
    if (!id || !name || !/^#[0-9a-f]{6}$/i.test(item.color)) return [];
    const systemRole = existingById.get(id)?.systemRole ?? defaultCategories[id]?.systemRole ?? null;
    return [[id, { name: name.slice(0, 120), description: typeof item.description === "string" ? item.description.trim().slice(0, 500) : "", color: item.color, visible: item.visible !== false, systemRole }] as const];
  }));
  for (const [id, definition] of Object.entries(defaultCategories)) {
    if (!requested.has(id)) requested.set(id, { ...definition, systemRole: definition.systemRole ?? null });
  }
  const entries = [...requested.entries()];
  const ids = entries.map(([id]) => id);
  await db.transaction(async (tx) => {
    for (const [id, item] of entries) await tx.insert(category).values({ workspace, id, ...item }).onConflictDoUpdate({ target: [category.workspace, category.id], set: item });
    await tx.update(plot).set({ categoryId: "default" }).where(and(eq(plot.workspace, workspace), notInArray(plot.categoryId, ids)));
    const removableIds = existingRows.filter(({ id, systemRole }) => !systemRole && !ids.includes(id)).map(({ id }) => id);
    if (removableIds.length) await tx.delete(category).where(and(eq(category.workspace, workspace), inArray(category.id, removableIds)));
  });
  return NextResponse.json(Object.fromEntries(entries));
}
