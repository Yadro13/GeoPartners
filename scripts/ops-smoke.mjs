import assert from "node:assert/strict";
import { coreTables } from "./backup-utils.mjs";
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

console.info(JSON.stringify({ status: "ok", checks: ["log-redaction", "backup-tables"] }));
