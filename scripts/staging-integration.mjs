import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const environmentName = process.env.RAILWAY_ENVIRONMENT_NAME;
const serviceName = process.env.RAILWAY_SERVICE_NAME;

if (environmentName !== "staging" || serviceName !== "geopartners-web") {
  throw new Error("This test is restricted to the Railway staging web service.");
}
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
  throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required.");
}

const runId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const localPort = Number(process.env.STAGING_E2E_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${localPort}`;
const mailpitUrl = process.env.STAGING_E2E_MAILPIT_URL ?? "http://mailpit.railway.internal:8025";
const mailpitHost = process.env.STAGING_E2E_SMTP_HOST ?? "mailpit.railway.internal";
const password = `Gp-${randomBytes(15).toString("base64url")}!4`;
const adminEmail = `gp-e2e-admin-${runId}@example.invalid`;
const userEmail = `gp-e2e-user-${runId}@example.invalid`;
const plotId = `gp-e2e-plot-${runId}`;
const cadastralNumber = `E2E:${runId}`;
const reviewComment = `Automated staging check ${runId}`;
const trackedMessageIds = new Set();
const client = new Client({ connectionString: process.env.DATABASE_URL });
const serverOutput = [];
let child;
let databaseConnected = false;

class CookieJar {
  cookies = new Map();

  absorb(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookie(headers.get("set-cookie"));

    for (const value of values) {
      const [pair, ...attributes] = value.split(";");
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => /^(max-age=0|expires=thu, 01 jan 1970)/i.test(attribute.trim()));
      if (expired || !cookieValue) this.cookies.delete(name);
      else this.cookies.set(name, cookieValue);
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/);
}

function logStep(message) {
  process.stdout.write(`[staging-e2e] ${message}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const { jar, expected = [200], json, form, redirect = "manual", ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set("origin", baseUrl);
  if (jar?.header()) headers.set("cookie", jar.header());
  let body = fetchOptions.body;
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form;
  }

  const response = await fetch(new URL(path, baseUrl), { ...fetchOptions, headers, body, redirect });
  jar?.absorb(response.headers);
  const text = await response.text();
  let payload = text;
  if (text && response.headers.get("content-type")?.includes("application/json")) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${fetchOptions.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }
  return { response, payload };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready: ${serverOutput.slice(-8).join(" ")}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child server is still starting.
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for the isolated Next.js server.");
}

function startServer() {
  const env = {
    ...process.env,
    PORT: String(localPort),
    HOSTNAME: "127.0.0.1",
    APP_URL: baseUrl,
    BETTER_AUTH_URL: baseUrl,
    ADMIN_EMAIL: adminEmail,
    SMTP_HOST: mailpitHost,
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    SMTP_FROM: "GeoPartners staging E2E <no-reply@example.invalid>",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_ADMIN_CHAT_ID: "",
  };
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(localPort), "-H", "127.0.0.1"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => {
    const line = chunk.toString().replaceAll(adminEmail, "[test-admin]").replaceAll(userEmail, "[test-user]").trim();
    if (line) serverOutput.push(line.slice(0, 1000));
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
}

async function signUp(email, name) {
  await request("/api/auth/sign-up/email", {
    method: "POST",
    expected: [200],
    json: { email, name, password, callbackURL: `${baseUrl}/pending` },
  });
}

async function signIn(email) {
  const jar = new CookieJar();
  await request("/api/auth/sign-in/email", {
    method: "POST",
    expected: [200],
    jar,
    json: { email, password, callbackURL: "/" },
  });
  assert(jar.header(), "Sign-in did not return a session cookie.");
  return jar;
}

async function verifyEmail(email) {
  const message = await waitForMessage(email, (item) => item.Subject === "Підтвердження email у GeoPartners");
  const text = await mailpitText(message.ID);
  const verificationUrl = text.match(/https?:\/\/[^\s<>"']+\/api\/auth\/verify-email\?[^\s<>"']+/)?.[0];
  assert(verificationUrl, "Verification email does not contain a Better Auth verification link.");
  const jar = new CookieJar();
  const response = await fetch(verificationUrl, { redirect: "manual", headers: { origin: baseUrl } });
  jar.absorb(response.headers);
  assert(response.status >= 200 && response.status < 400, `Email verification returned ${response.status}.`);
  return jar;
}

async function waitForMessage(email, predicate) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&start=0&limit=50`);
    assert(response.ok, `Mailpit search returned ${response.status}.`);
    const body = await response.json();
    const message = (body.messages ?? []).find((item) => predicate(item));
    if (message) {
      trackedMessageIds.add(message.ID);
      return message;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for the expected Mailpit message for ${email.replace(/^[^@]+/, "[test]")}.`);
}

async function mailpitText(id) {
  const response = await fetch(`${mailpitUrl}/view/${encodeURIComponent(id)}.txt`);
  assert(response.ok, `Mailpit message ${id} returned ${response.status}.`);
  return response.text();
}

async function databaseUser(email) {
  const result = await client.query(
    `select id, role, approval_status as "approvalStatus", email_verified as "emailVerified"
       from "user" where email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

async function registrationFor(email) {
  const result = await client.query(
    `select rr.id, rr.status
       from registration_request rr
       join "user" u on u.id = rr.user_id
      where u.email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

function testPlot(name = "Staging E2E plot") {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[30.5, 50.4], [30.501, 50.4], [30.501, 50.401], [30.5, 50.401], [30.5, 50.4]]],
    },
    properties: {
      id: plotId,
      cadastralNumber,
      name,
      category: "default",
      areaHa: 0.8,
      projectCapacity: 1.5,
      mainCandidateCadastral: "",
      owner: "E2E",
      lessee: "",
      status: "test",
      sourceFilename: `staging-e2e-${runId}`,
    },
  };
}

async function run() {
  await client.connect();
  databaseConnected = true;
  startServer();
  await waitForServer();
  logStep("isolated application and Mailpit are ready");

  await signUp(adminEmail, "Staging E2E Admin");
  await verifyEmail(adminEmail);
  const admin = await databaseUser(adminEmail);
  assert(admin?.role === "admin" && admin.approvalStatus === "approved" && admin.emailVerified, "Temporary administrator was not provisioned correctly.");
  const adminJar = await signIn(adminEmail);
  logStep("administrator signup, email verification and sign-in passed");

  await signUp(userEmail, "Staging E2E User");
  await verifyEmail(userEmail);
  const applicant = await databaseUser(userEmail);
  const registration = await registrationFor(userEmail);
  assert(applicant?.role === "user" && applicant.approvalStatus === "pending" && applicant.emailVerified, "Applicant state after verification is invalid.");
  assert(registration?.status === "pending", "Registration request was not created.");
  const userJar = await signIn(userEmail);
  await request("/api/plots", { jar: userJar, expected: [401] });
  const adminNotice = await waitForMessage(adminEmail, (item) => item.Subject === "Нова заявка на доступ до GeoPartners");
  assert((await mailpitText(adminNotice.ID)).includes("/admin/registrations/"), "Administrator notification does not contain the review link.");
  logStep("applicant registration, verification, pending state and admin notification passed");

  await request(`/api/admin/registrations/${registration.id}/decision`, {
    method: "POST",
    jar: adminJar,
    expected: [200],
    json: { decision: "approved", comment: reviewComment },
  });
  const approved = await databaseUser(userEmail);
  assert(approved?.approvalStatus === "approved", "Administrator approval was not persisted.");
  const decisionNotice = await waitForMessage(userEmail, (item) => item.Subject === "Доступ до GeoPartners підтверджено");
  assert((await mailpitText(decisionNotice.ID)).includes(reviewComment), "Approval email does not include the administrator comment.");
  logStep("administrator approval and decision email passed");

  await request("/api/workspace", { method: "POST", jar: adminJar, json: { workspace: "sandbox" } });
  await request("/api/workspace", { method: "POST", jar: userJar, json: { workspace: "sandbox" } });
  await request("/api/plots", { method: "POST", jar: adminJar, expected: [201], json: testPlot() });
  const sandboxPlots = await request("/api/plots", { jar: userJar });
  assert(Array.isArray(sandboxPlots.payload) && sandboxPlots.payload.some((item) => item.properties?.id === plotId), "User cannot read the staging E2E plot.");

  await request("/api/workspace", { method: "POST", jar: adminJar, json: { workspace: "production" } });
  const productionPlots = await request("/api/plots", { jar: adminJar });
  assert(Array.isArray(productionPlots.payload) && !productionPlots.payload.some((item) => item.properties?.id === plotId), "Sandbox plot leaked into the production workspace.");
  await request("/api/workspace", { method: "POST", jar: adminJar, json: { workspace: "sandbox" } });

  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "PATCH", jar: userJar, json: testPlot("Updated by E2E user") });
  const audit = await request(`/api/audit?q=${encodeURIComponent(cadastralNumber)}&scope=plots&limit=30`, { jar: userJar });
  const updatedAudit = audit.payload.items?.find((item) => item.action === "plot.updated" && item.entityId === plotId);
  assert(updatedAudit?.id && updatedAudit.canRestore, "Updated plot version is missing from the audit log.");

  await request(`/api/audit/${updatedAudit.id}/restore`, { method: "POST", jar: userJar, expected: [403] });
  await request("/api/import", { method: "POST", jar: userJar, expected: [403], form: new FormData() });
  await request("/api/categories", { method: "PUT", jar: userJar, expected: [403], json: {} });
  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "DELETE", jar: userJar, expected: [403] });
  await request(`/api/audit/${updatedAudit.id}/restore`, { method: "POST", jar: adminJar, expected: [200] });
  const restoredPlots = await request("/api/plots", { jar: userJar });
  const restored = restoredPlots.payload.find((item) => item.properties?.id === plotId);
  assert(restored?.properties?.name === "Staging E2E plot", "Administrator restore did not recover the prior plot version.");
  logStep("workspace isolation, CRUD, audit, restore and role permissions passed");

  await request(`/api/admin/users/${applicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    json: { role: "user", approvalStatus: "suspended" },
  });
  await request("/api/plots", { jar: userJar, expected: [401] });
  await request(`/api/admin/users/${admin.id}`, {
    method: "PATCH",
    jar: adminJar,
    expected: [409],
    json: { role: "user", approvalStatus: "suspended" },
  });
  logStep("suspension and protected administrator rules passed");

  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "DELETE", jar: adminJar, expected: [204] });
}

async function cleanup() {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5_000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  if (databaseConnected) {
    await client.query("begin");
    try {
      const users = await client.query(`select id from "user" where email = any($1::text[])`, [[adminEmail, userEmail]]);
      const userIds = users.rows.map((row) => row.id);
      await client.query(
        `delete from plot_version
          where plot_id = $1
             or created_by = any($2::text[])
             or audit_log_id in (select id from audit_log where entity_id = $1 or actor_user_id = any($2::text[]))`,
        [plotId, userIds],
      );
      await client.query(`delete from audit_log where entity_id = $1 or actor_user_id = any($2::text[])`, [plotId, userIds]);
      await client.query(`delete from plot where workspace = 'sandbox' and id = $1`, [plotId]);
      await client.query(
        `delete from notification_outbox
          where recipient = any($1::text[])
             or payload::text like $2`,
        [[adminEmail, userEmail], `%${runId}%`],
      );
      await client.query(`delete from verification where identifier like $1`, [`%${runId}%`]);
      await client.query(`delete from "user" where email = any($1::text[])`, [[adminEmail, userEmail]]);
      await client.query("commit");
      const residue = await client.query(
        `select
           (select count(*) from "user" where email = any($1::text[]))::int as users,
           (select count(*) from plot where id = $2)::int as plots,
           (select count(*) from audit_log where entity_id = $2)::int as audits`,
        [[adminEmail, userEmail], plotId],
      );
      assert(Object.values(residue.rows[0]).every((value) => value === 0), `Database cleanup left residue: ${JSON.stringify(residue.rows[0])}`);
      logStep("temporary database records were removed");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await client.end();
      databaseConnected = false;
    }
  }

  if (trackedMessageIds.size) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ IDs: [...trackedMessageIds] }),
    });
    assert(response.ok, `Mailpit cleanup returned ${response.status}.`);
    logStep("temporary Mailpit messages were removed");
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let failure;
try {
  await run();
} catch (error) {
  failure = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    failure = failure
      ? new AggregateError([failure, cleanupError], "Staging integration test and cleanup both failed.")
      : cleanupError;
  }
}

if (failure) {
  process.stderr.write(`[staging-e2e] FAILED: ${failure instanceof Error ? failure.message : String(failure)}\n`);
  if (serverOutput.length) process.stderr.write(`[staging-e2e] server tail:\n${serverOutput.slice(-8).join("\n")}\n`);
  process.exitCode = 1;
} else {
  logStep("PASS");
}
