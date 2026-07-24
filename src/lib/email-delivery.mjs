import nodemailer from "nodemailer";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailTransportMode(env = process.env) {
  const value = env.EMAIL_USE_SMTP?.trim().toLowerCase();
  if (!value || value === "true") return "smtp";
  if (value === "false") {
    const provider = env.EMAIL_HTTP_PROVIDER?.trim().toLowerCase() || "brevo";
    if (provider === "brevo" || provider === "resend") return provider;
    throw configurationError("EMAIL_HTTP_PROVIDER must be brevo or resend.", "EMAIL_PROVIDER_INVALID");
  }
  throw configurationError("EMAIL_USE_SMTP must be true or false.", "EMAIL_TRANSPORT_INVALID");
}

export function createEmailSender(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const mailerFactory = options.mailerFactory ?? nodemailer.createTransport;
  const mode = emailTransportMode(env);
  let mailer;

  return async function deliverEmail(message) {
    const from = env.EMAIL_FROM?.trim() || env.SMTP_FROM?.trim();
    if (!from) throw configurationError("EMAIL_FROM or SMTP_FROM is required.", "EMAIL_FROM_MISSING");

    if (mode === "smtp") {
      if (!env.SMTP_HOST) throw configurationError("SMTP_HOST is required when EMAIL_USE_SMTP=true.", "SMTP_CONFIG_MISSING");
      mailer ??= mailerFactory({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure: env.SMTP_SECURE === "true",
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      });
      await mailer.sendMail({ from, ...message });
      return { transport: "smtp" };
    }

    if (typeof fetchImpl !== "function") throw configurationError("HTTP fetch is unavailable.", "EMAIL_FETCH_MISSING");
    return mode === "brevo"
      ? sendWithBrevo(fetchImpl, env, from, message)
      : sendWithResend(fetchImpl, env, from, message);
  };
}

async function sendWithBrevo(fetchImpl, env, from, message) {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) throw configurationError("BREVO_API_KEY is required for Brevo HTTP delivery.", "BREVO_CONFIG_MISSING");
  const sender = parseSender(from);
  const response = await fetchImpl(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      ...(message.html ? { htmlContent: message.html } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw deliveryError("Brevo", response.status, payload);
  return { transport: "brevo", messageId: stringField(payload, "messageId") };
}

async function sendWithResend(fetchImpl, env, from, message) {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw configurationError("RESEND_API_KEY is required for Resend HTTP delivery.", "RESEND_CONFIG_MISSING");
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw deliveryError("Resend", response.status, payload);
  return { transport: "resend", messageId: stringField(payload, "id") };
}

function parseSender(value) {
  const named = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (named) return { name: named[1].trim().replace(/^["']|["']$/g, ""), email: named[2].trim() };
  return { email: value.trim() };
}

async function responsePayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function stringField(value, field) {
  return value && typeof value === "object" && typeof value[field] === "string" ? value[field] : undefined;
}

function deliveryError(provider, status, payload) {
  const detail = stringField(payload, "message") || stringField(payload, "name") || "request rejected";
  const error = new Error(`${provider} email delivery failed (${status}): ${detail}`);
  error.code = `EMAIL_HTTP_${status}`;
  return error;
}

function configurationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
