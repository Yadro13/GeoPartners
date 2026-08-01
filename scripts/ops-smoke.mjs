import assert from "node:assert/strict";
import { coreTables } from "./backup-utils.mjs";
import { createEmailSender, emailTransportMode } from "../src/lib/email-delivery.mjs";
import { hasPermission } from "../src/lib/permissions.ts";
import { defaultPlotStatuses } from "../src/data/plot-statuses.ts";
import { parsePlotStatusProgress, totalPlotStatusCost } from "../src/lib/plot-status-progress.ts";
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
  "plot_status",
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

assert.equal(hasPermission({ role: "user", accessLevel: "read" }, "plots.create"), false);
assert.equal(hasPermission({ role: "user", accessLevel: "read" }, "plots.update"), false);
assert.equal(hasPermission({ role: "user", accessLevel: "edit" }, "plots.create"), true);
assert.equal(hasPermission({ role: "user", accessLevel: "edit" }, "plots.update"), true);
assert.equal(hasPermission({ role: "user", accessLevel: "edit" }, "statuses.manage"), false);
assert.equal(hasPermission({ role: "user", accessLevel: "edit" }, "plots.delete"), false);
assert.equal(hasPermission({ role: "admin", accessLevel: "read" }, "plots.delete"), true);
assert.equal(hasPermission({ role: "admin", accessLevel: "read" }, "statuses.manage"), true);
assert.deepEqual(defaultPlotStatuses.map(({ name }) => name), [
  "обрана ділянка як варіант",
  "проведено перемовини з власником",
  "отримана згода власника",
  "проведено перемовини з орендарем",
  "отримано усну згоду орендаря",
  "отримано письмову згоду орендаря",
  "отримано схему поділу ділянки",
  "на виправленні помилок в ДЗК",
  "передано землевпоряднику на поділ",
  "поділ ділянки на реєстрації",
  "нові ділянки на реєстрації права власності",
  "підписано угоду про розірвання оренди",
  "угода про розірвання оренди на реєстрації",
  "передано нотаріусу для угоди",
  "ділянка під ВЕУ викуплена",
]);

const normalizedProgress = parsePlotStatusProgress([
  { statusId: "status_01", completedAt: "2026-07-25T14:30:00+03:00", cost: "1250.505" },
  { statusId: "status_04", completedAt: "2026-07-26T09:15:00.000Z", cost: null },
]);
assert.equal(normalizedProgress[0].completedAt, "2026-07-25T11:30:00.000Z");
assert.equal(normalizedProgress[0].cost, 1250.51);
assert.equal(totalPlotStatusCost(normalizedProgress), 1250.51);
assert.throws(() => parsePlotStatusProgress([
  { statusId: "status_01", completedAt: "2026-07-25T11:30:00.000Z", cost: 0 },
  { statusId: "status_01", completedAt: "2026-07-26T11:30:00.000Z", cost: 1 },
]));
assert.throws(() => parsePlotStatusProgress([{ statusId: "status_01", completedAt: "invalid", cost: 0 }]));
assert.throws(() => parsePlotStatusProgress([{ statusId: "status_01", completedAt: "2026-07-25T11:30:00.000Z", cost: -1 }]));

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

console.info(JSON.stringify({ status: "ok", checks: ["log-redaction", "backup-tables", "email-transports", "access-levels", "plot-statuses", "plot-status-progress"] }));

function testMessage() {
  return {
    to: "user@example.com",
    subject: "Test",
    text: "Plain text",
    html: "<p>HTML</p>",
  };
}
