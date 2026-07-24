import assert from "node:assert/strict";
import { coreTables } from "./backup-utils.mjs";
import { createEmailSender, emailTransportMode } from "../src/lib/email-delivery.mjs";
import { structuredLog } from "./structured-log.mjs";

let output = "";
const originalInfo = console.info;
try {
  console.info = (value) => { output = String(value); };
  structuredLog("ops-smoke", "info", "redaction.checked", {
    email: "private@example.com",
    recipient: "+380000000000",
    token: "secret-token",
    documentName: "private.pdf",
    fileCount: 3,
    errorCode: "EXPECTED",
  });
} finally {
  console.info = originalInfo;
}

const parsed = JSON.parse(output);
assert.equal(parsed.event, "redaction.checked");
assert.equal(parsed.fileCount, 3);
assert.equal(parsed.errorCode, "EXPECTED");
assert.equal("email" in parsed, false);
assert.equal("recipient" in parsed, false);
assert.equal("token" in parsed, false);
assert.equal("documentName" in parsed, false);
assert.equal(output.includes("private@example.com"), false);
assert.equal(output.includes("secret-token"), false);

for (const table of [
  "user",
  "session",
  "account",
  "verification",
  "registration_request",
  "notification_outbox",
  "app_settings",
  "category",
  "plot",
  "audit_log",
  "plot_version",
]) {
  assert(coreTables.includes(table), `backup verification requires ${table}`);
}

assert.equal(emailTransportMode({}), "smtp");
assert.equal(emailTransportMode({ EMAIL_USE_SMTP: "false" }), "brevo");
assert.equal(emailTransportMode({ EMAIL_USE_SMTP: "false", EMAIL_HTTP_PROVIDER: "resend" }), "resend");
assert.throws(() => emailTransportMode({ EMAIL_USE_SMTP: "sometimes" }), { code: "EMAIL_TRANSPORT_INVALID" });
assert.throws(() => emailTransportMode({ EMAIL_USE_SMTP: "false", EMAIL_HTTP_PROVIDER: "other" }), { code: "EMAIL_PROVIDER_INVALID" });

const smtpMessages = [];
const smtpSender = createEmailSender({
  env: {
    EMAIL_USE_SMTP: "true",
    EMAIL_FROM: "GeoPartners <sender@example.com>",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    EMAIL_HTTP_PROVIDER: "brevo",
    BREVO_API_KEY: "inactive-brevo-key",
  },
  mailerFactory: (options) => {
    assert.equal(options.host, "smtp.example.com");
    return { sendMail: async (message) => { smtpMessages.push(message); } };
  },
});
assert.deepEqual(await smtpSender(testMessage()), { transport: "smtp" });
assert.equal(smtpMessages[0].to, "user@example.com");

let brevoRequest;
const brevoSender = createEmailSender({
  env: {
    EMAIL_USE_SMTP: "false",
    EMAIL_HTTP_PROVIDER: "brevo",
    EMAIL_FROM: "GeoPartners <sender@example.com>",
    BREVO_API_KEY: "brevo-test-key",
    SMTP_HOST: "inactive-smtp.example.com",
    SMTP_PORT: "587",
  },
  fetchImpl: async (url, init) => {
    brevoRequest = { url: String(url), init };
    return Response.json({ messageId: "brevo-message" }, { status: 201 });
  },
});
assert.deepEqual(await brevoSender(testMessage()), { transport: "brevo", messageId: "brevo-message" });
assert.equal(brevoRequest.url, "https://api.brevo.com/v3/smtp/email");
assert.equal(brevoRequest.init.headers["api-key"], "brevo-test-key");
assert.deepEqual(JSON.parse(brevoRequest.init.body).sender, { name: "GeoPartners", email: "sender@example.com" });

let resendRequest;
const resendSender = createEmailSender({
  env: {
    EMAIL_USE_SMTP: "false",
    EMAIL_HTTP_PROVIDER: "resend",
    EMAIL_FROM: "GeoPartners <sender@example.com>",
    RESEND_API_KEY: "resend-test-key",
  },
  fetchImpl: async (url, init) => {
    resendRequest = { url: String(url), init };
    return Response.json({ id: "resend-message" });
  },
});
assert.deepEqual(await resendSender(testMessage()), { transport: "resend", messageId: "resend-message" });
assert.equal(resendRequest.url, "https://api.resend.com/emails");
assert.equal(resendRequest.init.headers.authorization, "Bearer resend-test-key");
assert.deepEqual(JSON.parse(resendRequest.init.body).to, ["user@example.com"]);

await assert.rejects(
  createEmailSender({
    env: { EMAIL_USE_SMTP: "false", EMAIL_HTTP_PROVIDER: "brevo", EMAIL_FROM: "sender@example.com" },
    fetchImpl: async () => Response.json({}),
  })(testMessage()),
  { code: "BREVO_CONFIG_MISSING" },
);

console.info(JSON.stringify({ status: "ok", checks: ["log-redaction", "backup-tables", "email-transports"] }));

function testMessage() {
  return {
    to: "user@example.com",
    subject: "Test",
    text: "Plain text",
    html: "<p>HTML</p>",
  };
}
