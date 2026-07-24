import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox, registrationRequest, user } from "@/db/schema";
import { sendEmail } from "./email";
import { sendTelegramMessage } from "./telegram";
import { errorFields, serverLog } from "./server-log";

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
  const adminEmail = process.env.ADMIN_EMAIL;
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const reviewUrl = `${appUrl}/admin/registrations/${input.requestId}`;
  const methodLabel = input.method === "google" ? "Google" : "email і пароль";
  const text = `Нова реєстрація в GeoPartners\nІм'я: ${input.name}\nEmail: ${input.email}\nСпосіб: ${methodLabel}\nПерегляд: ${reviewUrl}`;

  const tasks: Array<{ channel: "email" | "telegram"; recipient: string; promise: Promise<unknown> }> = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
    tasks.push({ channel: "telegram", recipient: process.env.TELEGRAM_ADMIN_CHAT_ID, promise: sendTelegramMessage(text, { text: "Переглянути заявку", url: reviewUrl }) });
  }
  if (adminEmail) {
    tasks.push({ channel: "email", recipient: adminEmail, promise: sendEmail({
      to: adminEmail,
      subject: "Нова заявка на доступ до GeoPartners",
      text,
      html: `<p>Нова заявка на доступ до GeoPartners.</p><p><strong>${escapeHtml(input.name)}</strong><br>${escapeHtml(input.email)}<br>Спосіб: ${methodLabel}</p><p><a href="${reviewUrl}">Переглянути заявку</a></p>`,
    }) });
  }

  const results = await Promise.allSettled(tasks.map((task) => task.promise));
  let queued = 0;
  for (const [index, result] of results.entries()) {
    if (result.status !== "rejected") continue;
    const task = tasks[index];
    queued += 1;
    serverLog("warn", "registration.admin_notification.queued", { channel: task.channel, ...errorFields(result.reason) });
    await db.insert(notificationOutbox).values({
      channel: task.channel,
      recipient: task.recipient,
      template: "new-registration",
      payload: { ...input, reviewUrl, text },
      status: "failed",
      attempts: "1",
      lastError: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }
  serverLog("info", "registration.admin_notification.completed", { selected: tasks.length, sent: tasks.length - queued, queued });
}

export async function getPendingRegistration(requestId: string) {
  const rows = await db
    .select({ request: registrationRequest, applicant: user })
    .from(registrationRequest)
    .innerJoin(user, eq(registrationRequest.userId, user.id))
    .where(and(eq(registrationRequest.id, requestId), eq(registrationRequest.status, "pending")))
    .limit(1);
  return rows[0] ?? null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
