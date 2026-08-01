import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox, registrationRequest, user } from "@/db/schema";
import { sendEmail } from "./email";
import { sendTelegramMessage } from "./telegram";
import { errorFields, serverLog } from "./server-log";
import { emailMessages } from "@/i18n/email-messages";
import { defaultLocale } from "@/i18n/config";
import { normalizeAppLocale } from "@/i18n/server-locale";

type RegistrationMethod = "password" | "google";

export async function createRegistrationRequest(userId: string, method: RegistrationMethod) {
  const [applicant] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!applicant || applicant.role === "admin") return;

  const [request] = await db
    .insert(registrationRequest)
    .values({ userId, method })
    .onConflictDoNothing({ target: registrationRequest.userId })
    .returning();

  if (!request) return;

  await db.update(user).set({ approvalStatus: "pending", registrationMethod: method }).where(eq(user.id, userId));
  serverLog("info", "registration.request.created", { method });
  await notifyAdminAboutRegistration({
    requestId: request.id,
    name: applicant.name,
    email: applicant.email,
    method,
  });
}

async function notifyAdminAboutRegistration(input: { requestId: string; name: string; email: string; method: RegistrationMethod }) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const reviewUrl = `${appUrl}/admin/registrations/${input.requestId}`;
  const activeAdmins = await db
    .select({ email: user.email, locale: user.locale })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.approvalStatus, "approved")));
  const adminEmails = new Map<string, ReturnType<typeof normalizeAppLocale>>();
  for (const admin of activeAdmins) {
    const email = admin.email.trim().toLowerCase();
    if (email) adminEmails.set(email, normalizeAppLocale(admin.locale));
  }
  const fallbackEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmails.size && fallbackEmail) adminEmails.set(fallbackEmail, defaultLocale);

  const tasks: Array<{ channel: "email" | "telegram"; recipient: string; promise: Promise<unknown> }> = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
    const telegramMessage = emailMessages(defaultLocale).newRegistration(input, reviewUrl);
    tasks.push({ channel: "telegram", recipient: process.env.TELEGRAM_ADMIN_CHAT_ID, promise: sendTelegramMessage(telegramMessage.text, { text: telegramMessage.button, url: reviewUrl }) });
  }
  for (const [adminEmail, locale] of adminEmails) {
    const message = emailMessages(locale).newRegistration(input, reviewUrl);
    tasks.push({ channel: "email", recipient: adminEmail, promise: sendEmail({
      to: adminEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }) });
  }

  const results = await Promise.allSettled(tasks.map((task) => task.promise));
  let queued = 0;
  for (const [index, result] of results.entries()) {
    if (result.status !== "rejected") continue;
    const task = tasks[index];
    queued += 1;
    serverLog("warn", "registration.admin_notification.queued", { channel: task.channel, ...errorFields(result.reason) });
    const locale = task.channel === "email" ? adminEmails.get(task.recipient) ?? defaultLocale : defaultLocale;
    const message = emailMessages(locale).newRegistration(input, reviewUrl);
    await db.insert(notificationOutbox).values({
      channel: task.channel,
      recipient: task.recipient,
      template: "new-registration",
      payload: { ...input, reviewUrl, locale, subject: message.subject, text: message.text, html: message.html, button: message.button },
      status: "failed",
      attempts: "1",
      lastError: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }
  serverLog("info", "registration.admin_notification.completed", { selected: tasks.length, sent: tasks.length - queued, queued });
}

export async function getRegistration(requestId: string) {
  const rows = await db
    .select({ request: registrationRequest, applicant: user })
    .from(registrationRequest)
    .innerJoin(user, eq(registrationRequest.userId, user.id))
    .where(eq(registrationRequest.id, requestId))
    .limit(1);
  return rows[0] ?? null;
}
