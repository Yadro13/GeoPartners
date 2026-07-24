import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { notificationOutbox, registrationRequest, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { errorFields, serverLog } from "@/lib/server-log";

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionData = await auth.api.getSession({ headers: await headers() });
  if (!sessionData) return NextResponse.json({ error: "Потрібна авторизація." }, { status: 401 });

  const [admin] = await db.select().from(user).where(eq(user.id, sessionData.user.id)).limit(1);
  if (!admin || admin.role !== "admin" || admin.approvalStatus !== "approved") return NextResponse.json({ error: "Недостатньо прав." }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Некоректні дані рішення." }, { status: 400 });
  const { id } = await params;
  const now = new Date();

  const applicant = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ request: registrationRequest, applicant: user })
      .from(registrationRequest)
      .innerJoin(user, eq(registrationRequest.userId, user.id))
      .where(and(eq(registrationRequest.id, id), eq(registrationRequest.status, "pending")))
      .limit(1);
    const target = rows[0];
    if (!target) return null;

    await tx.update(registrationRequest).set({ status: parsed.data.decision, comment: parsed.data.comment, decidedAt: now, decidedBy: admin.id }).where(eq(registrationRequest.id, id));
    await tx.update(user).set({ approvalStatus: parsed.data.decision, reviewComment: parsed.data.comment, reviewedAt: now, reviewedBy: admin.id }).where(eq(user.id, target.applicant.id));
    return target.applicant;
  });

  if (!applicant) return NextResponse.json({ error: "Заявка вже опрацьована або не існує." }, { status: 409 });

  const approved = parsed.data.decision === "approved";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const commentText = parsed.data.comment ? `\n\nКоментар адміністратора: ${parsed.data.comment}` : "";
  try {
    await sendEmail({
      to: applicant.email,
      subject: approved ? "Доступ до GeoPartners підтверджено" : "Результат реєстрації у GeoPartners",
      text: `${approved ? `Вашу реєстрацію підтверджено. Увійти: ${appUrl}/sign-in` : "Вашу заявку на доступ відхилено."}${commentText}`,
    });
    serverLog("info", "registration.decision_notification.sent", { decision: parsed.data.decision });
  } catch (error) {
    serverLog("warn", "registration.decision_notification.queued", { decision: parsed.data.decision, ...errorFields(error) });
    await db.insert(notificationOutbox).values({
      channel: "email",
      recipient: applicant.email,
      template: "registration-decision",
      payload: { decision: parsed.data.decision, comment: parsed.data.comment, appUrl },
      status: "failed",
      attempts: "1",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  serverLog("info", "registration.decision.completed", { decision: parsed.data.decision, commentProvided: Boolean(parsed.data.comment) });
  return NextResponse.json({ ok: true });
}
