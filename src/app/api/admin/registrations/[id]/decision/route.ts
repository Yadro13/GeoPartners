import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { notificationOutbox, registrationRequest, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { errorFields, serverLog } from "@/lib/server-log";
import { emailMessages } from "@/i18n/email-messages";
import { normalizeAppLocale } from "@/i18n/server-locale";

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
    const [claimed] = await tx
      .update(registrationRequest)
      .set({ status: parsed.data.decision, comment: parsed.data.comment, decidedAt: now, decidedBy: admin.id })
      .where(and(eq(registrationRequest.id, id), eq(registrationRequest.status, "pending")))
      .returning({ userId: registrationRequest.userId });
    if (!claimed) return null;

    const [target] = await tx.select().from(user).where(eq(user.id, claimed.userId)).limit(1);
    if (!target) throw new Error("Applicant is missing for a claimed registration request.");
    await tx.update(user).set({ approvalStatus: parsed.data.decision, reviewComment: parsed.data.comment, reviewedAt: now, reviewedBy: admin.id }).where(eq(user.id, target.id));
    return target;
  });

  if (!applicant) return NextResponse.json({ error: "Заявка вже опрацьована або не існує." }, { status: 409 });

  const approved = parsed.data.decision === "approved";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const locale = normalizeAppLocale(applicant.locale);
  const message = emailMessages(locale).decision(approved, parsed.data.comment, appUrl);
  try {
    await sendEmail({
      to: applicant.email,
      ...message,
    });
    serverLog("info", "registration.decision_notification.sent", { decision: parsed.data.decision });
  } catch (error) {
    serverLog("warn", "registration.decision_notification.queued", { decision: parsed.data.decision, ...errorFields(error) });
    await db.insert(notificationOutbox).values({
      channel: "email",
      recipient: applicant.email,
      template: "registration-decision",
      payload: { decision: parsed.data.decision, comment: parsed.data.comment, appUrl, locale, subject: message.subject, text: message.text },
      status: "failed",
      attempts: "1",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  serverLog("info", "registration.decision.completed", { decision: parsed.data.decision, commentProvided: Boolean(parsed.data.comment) });
  return NextResponse.json({ ok: true });
}
