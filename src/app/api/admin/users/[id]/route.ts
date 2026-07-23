import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";

const bodySchema = z.object({ role: z.enum(["user", "admin"]), approvalStatus: z.enum(["approved", "suspended"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin" || admin.approvalStatus !== "approved") return NextResponse.json({ error: "Недостатньо прав." }, { status: 403 });
  const { id } = await params; const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Некоректні роль або статус." }, { status: 400 });
  const [target] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: "Користувача не знайдено." }, { status: 404 });
  if (target.id === admin.id || target.email.toLocaleLowerCase() === process.env.ADMIN_EMAIL?.toLocaleLowerCase()) return NextResponse.json({ error: "Налаштування захищеного адміністратора не можна змінити." }, { status: 409 });
  await db.update(user).set({ role: parsed.data.role, approvalStatus: parsed.data.approvalStatus }).where(eq(user.id, id));
  return NextResponse.json({ ok: true });
}
