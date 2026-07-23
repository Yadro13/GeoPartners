import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";
import { workspaceCookieName, workspaceCookieOptions } from "@/lib/data-workspace";
import { hasPermission } from "@/lib/permissions";

const bodySchema = z.object({ testWorkspaceEnabled: z.boolean() });

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "workspaces.manage")) return NextResponse.json({ error: "Налаштування баз доступне лише адміністратору." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Некоректне значення налаштування." }, { status: 400 });
  await db.insert(appSettings).values({ id: "global", testWorkspaceEnabled: parsed.data.testWorkspaceEnabled, updatedBy: currentUser.id }).onConflictDoUpdate({
    target: appSettings.id,
    set: { testWorkspaceEnabled: parsed.data.testWorkspaceEnabled, updatedBy: currentUser.id, updatedAt: new Date() },
  });
  const response = NextResponse.json({ testWorkspaceEnabled: parsed.data.testWorkspaceEnabled });
  if (!parsed.data.testWorkspaceEnabled) response.cookies.set(workspaceCookieName, "production", workspaceCookieOptions());
  return response;
}
