import nodemailer from "nodemailer";
import pg from "pg";
import { structuredError, structuredLog } from "./structured-log.mjs";

const service = "geopartners-notifications";
let pool = null;

try {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error("Missing required configuration"), { code: "CONFIG_MISSING" });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  }) : null;
  await dispatch(pool, mailer);
} catch (error) {
  structuredLog(service, "error", "notifications.worker.failed", structuredError(error));
  process.exitCode = 1;
} finally {
  await pool?.end();
}

async function dispatch(database, mailer) {
  const startedAt = Date.now();
  const { rows } = await database.query(`
    select id, channel, recipient, template, payload, attempts
    from notification_outbox
    where status in ('pending', 'failed')
      and next_attempt_at <= now()
      and attempts::integer < 6
    order by created_at
    limit 50
  `);
  structuredLog(service, "info", "notifications.dispatch.started", { selected: rows.length });

  let sent = 0;
  let failed = 0;
  for (const notification of rows) {
    try {
      await deliver(notification, mailer);
      await database.query("update notification_outbox set status = 'sent', sent_at = now(), last_error = null where id = $1", [notification.id]);
      sent += 1;
      structuredLog(service, "info", "notifications.delivery.sent", {
        channel: notification.channel,
        template: notification.template,
        attempt: Number(notification.attempts) + 1,
      });
    } catch (error) {
      failed += 1;
      await database.query(`update notification_outbox set status = 'failed', attempts = (attempts::integer + 1)::numeric, last_error = $2, next_attempt_at = now() + interval '15 minutes' where id = $1`, [notification.id, error instanceof Error ? error.message : String(error)]);
      structuredLog(service, "warn", "notifications.delivery.failed", {
        channel: notification.channel,
        template: notification.template,
        attempt: Number(notification.attempts) + 1,
        ...structuredError(error),
      });
    }
  }

  const { rows: [queue] } = await database.query(`
    select
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'failed' and attempts::integer < 6)::int as failed,
      count(*) filter (where status = 'failed' and attempts::integer >= 6)::int as exhausted,
      min(created_at) filter (where status <> 'sent') as oldest_unsent_at
    from notification_outbox
  `);
  const oldestAgeMinutes = queue.oldest_unsent_at
    ? Math.max(0, Math.round((Date.now() - new Date(queue.oldest_unsent_at).getTime()) / 60000))
    : 0;
  structuredLog(service, failed || queue.exhausted ? "warn" : "info", "notifications.dispatch.completed", {
    selected: rows.length,
    sent,
    failed,
    pending: queue.pending,
    retriable: queue.failed,
    exhausted: queue.exhausted,
    oldestAgeMinutes,
    durationMs: Date.now() - startedAt,
  });
}

async function deliver(notification, mailer) {
  if (notification.channel === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw Object.assign(new Error("Telegram is not configured"), { code: "TELEGRAM_CONFIG_MISSING" });
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: notification.recipient,
        text: notification.payload.text,
        disable_web_page_preview: true,
        ...(notification.payload.reviewUrl ? { reply_markup: { inline_keyboard: [[{ text: "Переглянути заявку", url: notification.payload.reviewUrl }]] } } : {}),
      }),
    });
    if (!response.ok) throw Object.assign(new Error("Telegram delivery failed"), { code: `HTTP_${response.status}` });
    return;
  }

  if (!mailer) throw Object.assign(new Error("SMTP is not configured"), { code: "SMTP_CONFIG_MISSING" });
  const message = buildEmail(notification);
  await mailer.sendMail({ from: process.env.SMTP_FROM, to: notification.recipient, ...message });
}

function buildEmail(notification) {
  if (notification.template === "new-registration") {
    return { subject: "Нова заявка на доступ до GeoPartners", text: notification.payload.text };
  }
  const approved = notification.payload.decision === "approved";
  const comment = notification.payload.comment ? `\n\nКоментар адміністратора: ${notification.payload.comment}` : "";
  return {
    subject: approved ? "Доступ до GeoPartners підтверджено" : "Результат реєстрації у GeoPartners",
    text: `${approved ? `Вашу реєстрацію підтверджено. Увійти: ${notification.payload.appUrl}/sign-in` : "Вашу заявку на доступ відхилено."}${comment}`,
  };
}
