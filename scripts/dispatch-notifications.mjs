import nodemailer from "nodemailer";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
}) : null;

try {
  const { rows } = await pool.query(`
    select id, channel, recipient, template, payload, attempts
    from notification_outbox
    where status in ('pending', 'failed')
      and next_attempt_at <= now()
      and attempts::integer < 6
    order by created_at
    limit 50
  `);

  for (const notification of rows) {
    try {
      await deliver(notification);
      await pool.query("update notification_outbox set status = 'sent', sent_at = now(), last_error = null where id = $1", [notification.id]);
    } catch (error) {
      await pool.query(`update notification_outbox set status = 'failed', attempts = (attempts::integer + 1)::numeric, last_error = $2, next_attempt_at = now() + interval '15 minutes' where id = $1`, [notification.id, error instanceof Error ? error.message : String(error)]);
    }
  }

  console.info(`Notification dispatch completed: ${rows.length} item(s)`);
} finally {
  await pool.end();
}

async function deliver(notification) {
  if (notification.channel === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
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
    if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
    return;
  }

  if (!mailer) throw new Error("SMTP is not configured");
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
