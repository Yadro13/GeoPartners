import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/access";

const bodySchema = z.object({
  role: z.enum(["user", "admin"]),
  accessLevel: z.enum(["read", "edit"]),
  approvalStatus: z.enum(["pending", "approved", "rejected", "suspended"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin" || admin.approvalStatus !== "approved") return NextResponse.json({ error: "Недостатньо прав." }, { status: 403 });
  const { id } = await params; const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Некоректні роль, рівень доступу або статус." }, { status: 400 });
  const [target] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: "Користувача не знайдено." }, { status: 404 });
  if (target.id === admin.id || target.email.toLocaleLowerCase() === process.env.ADMIN_EMAIL?.toLocaleLowerCase()) return NextResponse.json({ error: "Налаштування захищеного адміністратора не можна змінити." }, { status: 409 });
  if (target.approvalStatus === "rejected") return NextResponse.json({ error: "Налаштування відхиленої заявки не можна змінити." }, { status: 409 });
  const decisionRequired = target.approvalStatus === "pending";
  if (decisionRequired && parsed.data.approvalStatus !== target.approvalStatus) return NextResponse.json({ error: "Підтвердження або відхилення виконайте через форму розгляду заявки." }, { status: 409 });
  if (!decisionRequired && parsed.data.approvalStatus !== "approved" && parsed.data.approvalStatus !== "suspended") return NextResponse.json({ error: "Некоректна зміна статусу користувача." }, { status: 409 });
  await db.update(user).set({
    role: parsed.data.role,
    accessLevel: parsed.data.role === "admin" ? "edit" : parsed.data.accessLevel,
    approvalStatus: parsed.data.approvalStatus,
  }).where(eq(user.id, id));
  return NextResponse.json({ ok: true });
}
