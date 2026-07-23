import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  return transporter;
}

export async function sendEmail(message: EmailMessage) {
  const mailer = getTransporter();
  if (!mailer) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:preview] ${message.subject} -> ${message.to}\n${message.text}`);
      return;
    }
    throw new Error("SMTP is not configured");
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM ?? "GeoPartners <no-reply@localhost>",
    ...message,
  });
}
