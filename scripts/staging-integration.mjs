import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const environmentName = process.env.RAILWAY_ENVIRONMENT_NAME;
const serviceName = process.env.RAILWAY_SERVICE_NAME;

if (environmentName !== "staging" || serviceName !== "geopartners-web") {
  throw new Error("This test is restricted to the Railway staging web service.");
}
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.SNAPSHOT_CRON_SECRET) {
  throw new Error("DATABASE_URL, BETTER_AUTH_SECRET and SNAPSHOT_CRON_SECRET are required.");
}

const runId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const localPort = Number(process.env.STAGING_E2E_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${localPort}`;
const mailpitUrl = process.env.STAGING_E2E_MAILPIT_URL ?? "http://mailpit.railway.internal:8025";
const mailpitHost = process.env.STAGING_E2E_SMTP_HOST ?? "mailpit.railway.internal";
const password = `Gp-${randomBytes(15).toString("base64url")}!4`;
const adminEmail = `gp-e2e-admin-${runId}@example.invalid`;
const secondAdminEmail = `gp-e2e-admin-2-${runId}@example.invalid`;
const userEmail = `gp-e2e-user-${runId}@example.invalid`;
const testEmails = [adminEmail, secondAdminEmail, userEmail];
const plotId = `gp-e2e-plot-${runId}`;
const categoryId = `gp-e2e-category-${runId}`;
const categoryDescription = `Category description ${runId}`;
const statusId = `gp-e2e-status-${runId}`;
const statusName = `Тестовий статус ${runId}`;
const cadastralNumber = `E2E:${runId}`;
const reviewComment = `Automated staging check ${runId}`;
const trackedMessageIds = new Set();
const client = new Client({ connectionString: process.env.DATABASE_URL });
const serverOutput = [];
let child;
let databaseConnected = false;
let snapshotId;
let snapshotIds = [];

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
    EMAIL_USE_SMTP: "true",
    EMAIL_FROM: "GeoPartners staging E2E <no-reply@example.invalid>",
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
    const line = chunk.toString().replaceAll(adminEmail, "[test-admin]").replaceAll(secondAdminEmail, "[test-admin-2]").replaceAll(userEmail, "[test-user]").trim();
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

async function waitForMessageContaining(email, subject, expectedText) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&start=0&limit=50`);
    assert(response.ok, `Mailpit search returned ${response.status}.`);
    const body = await response.json();
    for (const message of (body.messages ?? []).filter((item) => item.Subject === subject)) {
      const content = await mailpitText(message.ID);
      if (!content.includes(expectedText)) continue;
      trackedMessageIds.add(message.ID);
      return message;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for matching Mailpit content for ${email.replace(/^[^@]+/, "[test]")}.`);
}

async function mailpitText(id) {
  const response = await fetch(`${mailpitUrl}/view/${encodeURIComponent(id)}.txt`);
  assert(response.ok, `Mailpit message ${id} returned ${response.status}.`);
  return response.text();
}

async function databaseUser(email) {
  const result = await client.query(
    `select id, role, access_level as "accessLevel", approval_status as "approvalStatus", email_verified as "emailVerified", locale, preferred_workspace as "preferredWorkspace"
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

function testPlot(name = "Staging E2E plot", status = "обрана ділянка як варіант", statusProgress) {
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
      roadOwnershipType: "private",
      servitudeValidFrom: "2026-08-01",
      servitudeValidUntil: "2027-08-01",
      servitudePaymentAmount: 1200.5,
      servitudePaymentPeriod: "yearly",
      substationType: "110/35 kV",
      substationCapacityMw: 80,
      resultLinks: [{ type: "road", number: "E2E-R1" }, { type: "servitude", number: "E2E-S1" }, { type: "substation", number: "E2E-P1" }],
      status,
      ...(statusProgress ? { statusProgress } : {}),
      sourceFilename: `staging-e2e-${runId}`,
    },
  };
}

function repeatImportPlot(owner, importDecisions) {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[30.5, 50.4], [30.502, 50.4], [30.502, 50.402], [30.5, 50.402], [30.5, 50.4]]] },
      properties: {
        id: `repeat-${plotId}`, cadastralNumber, name: "Imported name", category: "planned_wtg", areaHa: 1.2345,
        projectCapacity: 0, mainCandidateCadastral: "imported-main", owner, lessee: "Imported lessee",
        roadOwnershipType: "municipal", servitudeValidFrom: "", servitudeValidUntil: "", servitudePaymentAmount: null,
        servitudePaymentPeriod: "", substationType: "", substationCapacityMw: null,
        resultLinks: [], status: "проведено перемовини з власником", statusProgress: [],
        ...(importDecisions ? { importDecisions } : {}),
      },
    }],
  };
}

async function importGeoJson(jar, name, payload) {
  const form = new FormData();
  form.append("files", new File([JSON.stringify(payload)], name, { type: "application/geo+json" }));
  return request("/api/import", { method: "POST", jar, form });
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
  assert(admin?.role === "admin" && admin.accessLevel === "edit" && admin.approvalStatus === "approved" && admin.emailVerified, "Temporary administrator was not provisioned correctly.");
  const adminJar = await signIn(adminEmail);
  logStep("administrator signup, email verification and sign-in passed");

  await signUp(secondAdminEmail, "Staging E2E Second Admin");
  await verifyEmail(secondAdminEmail);
  const secondApplicant = await databaseUser(secondAdminEmail);
  const secondRegistration = await registrationFor(secondAdminEmail);
  assert(secondApplicant?.approvalStatus === "pending" && secondRegistration?.status === "pending", "Second administrator applicant was not created.");
  await waitForMessageContaining(adminEmail, "Нова заявка на доступ до GeoPartners", secondAdminEmail);
  await request(`/api/admin/registrations/${secondRegistration.id}/decision`, {
    method: "POST",
    jar: adminJar,
    json: { decision: "approved", comment: "Second staging administrator" },
  });
  await waitForMessage(secondAdminEmail, (item) => item.Subject === "Доступ до GeoPartners підтверджено");
  await request(`/api/admin/users/${secondApplicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    json: { role: "admin", accessLevel: "edit", approvalStatus: "approved" },
  });
  const secondAdminJar = await signIn(secondAdminEmail);
  assert((await databaseUser(secondAdminEmail))?.role === "admin", "Second administrator role was not persisted.");
  await request("/api/locale", { method: "POST", jar: secondAdminJar, json: { locale: "en" } });
  assert((await databaseUser(secondAdminEmail))?.locale === "en", "Administrator locale was not persisted.");
  logStep("second administrator provisioning passed");

  await signUp(userEmail, "Staging E2E User");
  await verifyEmail(userEmail);
  const applicant = await databaseUser(userEmail);
  const registration = await registrationFor(userEmail);
  assert(applicant?.role === "user" && applicant.accessLevel === "read" && applicant.approvalStatus === "pending" && applicant.emailVerified, "Applicant state after verification is invalid.");
  assert(registration?.status === "pending", "Registration request was not created.");
  const userJar = await signIn(userEmail);
  await request("/api/locale", { method: "POST", jar: userJar, json: { locale: "de" } });
  assert((await databaseUser(userEmail))?.locale === "de", "Applicant locale was not persisted.");
  await request("/api/plots", { jar: userJar, expected: [401] });
  const [adminNotice, secondAdminNotice] = await Promise.all([
    waitForMessageContaining(adminEmail, "Нова заявка на доступ до GeoPartners", userEmail),
    waitForMessageContaining(secondAdminEmail, "New GeoPartners access request", userEmail),
  ]);
  assert((await mailpitText(adminNotice.ID)).includes("/admin/registrations/") && (await mailpitText(secondAdminNotice.ID)).includes("/admin/registrations/"), "Administrator notification does not contain the review link.");
  logStep("applicant registration, verification, pending state and multi-admin notifications passed");

  await request(`/api/admin/users/${applicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    json: { role: "user", accessLevel: "edit", approvalStatus: "pending" },
  });
  assert((await databaseUser(userEmail))?.accessLevel === "edit", "Administrator cannot preconfigure access for a pending applicant.");
  await request(`/api/admin/users/${applicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    json: { role: "user", accessLevel: "read", approvalStatus: "pending" },
  });
  await request(`/api/admin/users/${applicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    expected: [409],
    json: { role: "user", accessLevel: "edit", approvalStatus: "approved" },
  });
  logStep("pending applicant access configuration and guarded decision flow passed");

  const decisionAttempts = await Promise.all([
    request(`/api/admin/registrations/${registration.id}/decision`, {
      method: "POST",
      jar: adminJar,
      expected: [200, 409],
      json: { decision: "approved", comment: reviewComment },
    }),
    request(`/api/admin/registrations/${registration.id}/decision`, {
      method: "POST",
      jar: secondAdminJar,
      expected: [200, 409],
      json: { decision: "approved", comment: reviewComment },
    }),
  ]);
  assert(decisionAttempts.map(({ response }) => response.status).sort().join(",") === "200,409", "Concurrent administrator decisions were not resolved atomically.");
  const approved = await databaseUser(userEmail);
  assert(approved?.approvalStatus === "approved", "Administrator approval was not persisted.");
  const decidedRequest = await client.query("select status, decided_by as \"decidedBy\", comment from registration_request where id = $1", [registration.id]);
  assert(decidedRequest.rows[0]?.status === "approved" && [admin.id, secondApplicant.id].includes(decidedRequest.rows[0]?.decidedBy), "Registration decision author was not persisted.");
  const processedPage = await request(`/admin/registrations/${registration.id}`, { jar: secondAdminJar });
  assert(typeof processedPage.payload === "string" && processedPage.payload.includes("Review result") && processedPage.payload.includes(reviewComment), "Processed registration result page is incomplete.");
  const decisionNotice = await waitForMessage(userEmail, (item) => item.Subject === "Zugang zu GeoPartners genehmigt");
  assert((await mailpitText(decisionNotice.ID)).includes(reviewComment), "Approval email does not include the administrator comment.");
  logStep("atomic administrator approval, recorded reviewer, result page and decision email passed");

  const defaultWorkspace = await request("/api/workspace", { jar: userJar });
  assert(defaultWorkspace.payload.workspace === "sandbox" && defaultWorkspace.payload.testWorkspaceEnabled === true, "A user without a saved choice did not start in the enabled test database.");
  await request("/api/workspace", { method: "POST", jar: userJar, json: { workspace: "production" } });
  const reloggedUserJar = new CookieJar();
  for (const [name, value] of userJar.cookies) {
    if (name !== "geopartners-data-workspace") reloggedUserJar.cookies.set(name, value);
  }
  const restoredWorkspace = await request("/api/workspace", { jar: reloggedUserJar });
  assert(restoredWorkspace.payload.workspace === "production", "The user's production database choice was not restored after sign-in.");
  assert((await databaseUser(userEmail))?.preferredWorkspace === "production", "The user's database choice was not persisted in the profile.");
  const independentAdminWorkspace = await request("/api/workspace", { jar: adminJar });
  assert(independentAdminWorkspace.payload.workspace === "sandbox", "One user's database choice leaked into another user's profile.");
  await request("/api/workspace", { method: "POST", jar: userJar, json: { workspace: "sandbox" } });
  logStep("test-database default and per-user last choice persistence passed");

  await request("/api/workspace", { method: "POST", jar: adminJar, json: { workspace: "sandbox" } });
  await request("/api/plots", { method: "POST", jar: adminJar, expected: [201], json: testPlot() });
  const sandboxPlots = await request("/api/plots", { jar: userJar });
  assert(Array.isArray(sandboxPlots.payload) && sandboxPlots.payload.some((item) => item.properties?.id === plotId), "User cannot read the staging E2E plot.");
  const specializedPlot = sandboxPlots.payload.find((item) => item.properties?.id === plotId)?.properties;
  assert(specializedPlot?.roadOwnershipType === "private" && specializedPlot?.servitudePaymentAmount === 1200.5 && specializedPlot?.servitudePaymentPeriod === "yearly" && specializedPlot?.substationType === "110/35 kV" && specializedPlot?.substationCapacityMw === 80, "Specialized road, easement, and substation fields were not persisted.");
  await importGeoJson(adminJar, `repeat-${runId}.geojson`, repeatImportPlot("Imported owner"));
  const protectedRepeat = (await request("/api/plots", { jar: adminJar })).payload.find((item) => item.properties?.id === plotId)?.properties;
  assert(protectedRepeat?.areaHa === 1.2345 && protectedRepeat?.owner === "E2E" && protectedRepeat?.lessee === "Imported lessee", "Repeat import did not update area, preserve a conflicting owner, or fill a missing lessee.");
  assert(protectedRepeat?.name === "Staging E2E plot" && protectedRepeat?.category === "default" && protectedRepeat?.projectCapacity === 1.5, "Repeat import overwrote manually managed plot fields.");
  assert(protectedRepeat?.roadOwnershipType === "private" && protectedRepeat?.servitudePaymentAmount === 1200.5 && protectedRepeat?.resultLinks?.length === 3, "Repeat import overwrote protected specialized values or result links.");
  await importGeoJson(adminJar, `repeat-explicit-${runId}.geojson`, repeatImportPlot("Accepted imported owner", { fields: { owner: "imported" } }));
  const explicitlyResolved = (await request("/api/plots", { jar: adminJar })).payload.find((item) => item.properties?.id === plotId)?.properties;
  assert(explicitlyResolved?.owner === "Accepted imported owner", "Server ignored the administrator's explicit repeat-import field decision.");
  logStep("repeat-import merge policy and explicit conflict resolution passed");
  await request("/api/snapshots", { method: "POST", jar: userJar, expected: [405] });
  await request("/api/snapshots", { method: "POST", jar: adminJar, expected: [405] });
  const scheduledRun = await request("/api/internal/snapshots/run", { method: "POST", headers: { authorization: `Bearer ${process.env.SNAPSHOT_CRON_SECRET}` }, json: { force: true } });
  snapshotIds = scheduledRun.payload.created?.map(({ id }) => id) ?? [];
  snapshotId = scheduledRun.payload.created?.find(({ workspace }) => workspace === "sandbox")?.id;
  assert(snapshotId && snapshotIds.length === 2, "Scheduled snapshot run did not capture both workspaces.");
  await request("/api/snapshots", { jar: userJar, expected: [403] });
  await request(`/api/snapshots/${snapshotId}`, { jar: userJar, expected: [403] });
  const snapshotList = await request("/api/snapshots", { jar: adminJar });
  assert(snapshotList.payload.items?.some((item) => item.id === snapshotId), "Administrator cannot list snapshots in the active workspace.");
  const snapshotDetail = await request(`/api/snapshots/${snapshotId}`, { jar: adminJar });
  assert(snapshotDetail.payload.payload?.plots?.some((item) => item.properties?.id === plotId), "Snapshot payload does not contain the captured plot.");
  assert(snapshotDetail.payload.kpis?.plots?.current >= 1 && Array.isArray(snapshotDetail.payload.kpis?.statuses), "Snapshot KPI comparison is incomplete.");
  let immutableUpdateRejected = false;
  try {
    await client.query("update workspace_snapshot set plot_count = plot_count + 1 where id = $1", [snapshotId]);
  } catch (error) {
    immutableUpdateRejected = String(error?.message ?? error).includes("workspace snapshots are immutable");
  }
  assert(immutableUpdateRejected, "Database allowed an existing workspace snapshot to be modified.");
  await request("/api/plots", { method: "POST", jar: userJar, expected: [403], json: testPlot("Read-only create attempt") });
  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "PATCH", jar: userJar, expected: [403], json: testPlot("Read-only update attempt") });

  await request("/api/workspace", { method: "POST", jar: adminJar, json: { workspace: "production" } });
  const productionPlots = await request("/api/plots", { jar: adminJar });
  assert(Array.isArray(productionPlots.payload) && !productionPlots.payload.some((item) => item.properties?.id === plotId), "Sandbox plot leaked into the production workspace.");
  const productionSnapshots = await request("/api/snapshots", { jar: adminJar });
  assert(!productionSnapshots.payload.items?.some((item) => item.id === snapshotId), "Sandbox snapshot leaked into the production workspace.");
  await request("/api/workspace", { method: "POST", jar: adminJar, json: { workspace: "sandbox" } });
  logStep("admin-only workspace snapshot access, immutability and isolation passed");

  await request(`/api/admin/users/${applicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    json: { role: "user", accessLevel: "edit", approvalStatus: "approved" },
  });
  const editor = await databaseUser(userEmail);
  assert(editor?.accessLevel === "edit", "Administrator did not grant plot editing access.");
  const statusCatalog = await request("/api/plot-statuses", { jar: userJar });
  const plotStatusCatalog = statusCatalog.payload.filter((item) => item.scope === "plots");
  const roadStatusCatalog = statusCatalog.payload.filter((item) => item.scope === "road");
  assert(plotStatusCatalog[0]?.name === "обрана ділянка як варіант" && roadStatusCatalog.length === 23, "Scoped status directories are incomplete or out of order.");
  await request("/api/plot-statuses", { method: "PUT", jar: userJar, expected: [403], json: statusCatalog.payload });
  await request("/api/plot-statuses", { method: "PUT", jar: adminJar, json: [...statusCatalog.payload, { id: statusId, name: statusName, scope: "plots" }] });
  const administratorProgress = [
    { statusId: plotStatusCatalog[0].id, completedAt: "2026-07-22T09:30:00.000Z", cost: 0 },
    { statusId, completedAt: "2026-07-24T11:30:00.000Z", cost: 1250.5 },
  ];
  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "PATCH", jar: adminJar, json: testPlot("Stage expenses assigned by E2E administrator", statusName, administratorProgress) });
  const editorVisiblePlot = await request("/api/plots", { jar: userJar });
  const editorVisibleProgress = editorVisiblePlot.payload.find((item) => item.properties?.id === plotId)?.properties?.statusProgress;
  assert(editorVisibleProgress?.length === 2 && editorVisibleProgress.every((item) => !("cost" in item)), "Editor API response leaked stage expenses.");
  const completedAt = "2026-07-25T11:30:00.000Z";
  const editorProgress = [
    { statusId: plotStatusCatalog[0].id, completedAt: "2026-07-22T09:30:00.000Z", cost: 999999 },
    { statusId, completedAt, cost: 999999 },
  ];
  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "PATCH", jar: userJar, json: testPlot("Stages assigned by E2E editor", statusName, editorProgress) });
  const stagedPlot = await request("/api/plots", { jar: userJar });
  const stagedProperties = stagedPlot.payload.find((item) => item.properties?.id === plotId)?.properties;
  assert(stagedProperties?.statusProgress?.length === 2, "Editor cannot save independently completed plot stages.");
  assert(stagedProperties.statusProgress[1]?.completedAt === completedAt && stagedProperties.statusProgress.every((item) => !("cost" in item)), "Editor response leaked expenses or failed to persist the stage datetime.");
  const administratorPlot = await request("/api/plots", { jar: adminJar });
  const administratorProperties = administratorPlot.payload.find((item) => item.properties?.id === plotId)?.properties;
  assert(administratorProperties.statusProgress[0]?.cost === 0 && administratorProperties.statusProgress[1]?.cost === 1250.5, "Editor overwrote administrator-managed stage expenses.");
  const renamedStatus = `${statusName} renamed`;
  await request("/api/plot-statuses", { method: "PUT", jar: adminJar, json: [...statusCatalog.payload, { id: statusId, name: renamedStatus, scope: "plots" }] });
  const renamedPlot = await request("/api/plots", { jar: userJar });
  assert(renamedPlot.payload.find((item) => item.properties?.id === plotId)?.properties?.status === renamedStatus, "Status rename was not propagated to the plot.");
  assert(renamedPlot.payload.find((item) => item.properties?.id === plotId)?.properties?.statusProgress?.some((item) => item.statusId === statusId), "Status rename removed plot stage progress.");
  await request("/api/plot-statuses", { method: "PUT", jar: adminJar, json: statusCatalog.payload });
  const clearedPlot = await request("/api/plots", { jar: userJar });
  const clearedProperties = clearedPlot.payload.find((item) => item.properties?.id === plotId)?.properties;
  assert(clearedProperties?.status === plotStatusCatalog[0].name, "Deleting the latest stage did not fall back to the preceding completed stage.");
  assert(!clearedProperties?.statusProgress?.some((item) => item.statusId === statusId), "Deleted status was not removed from plot stage progress.");
  await request("/api/result-status-progress", { method: "PUT", jar: adminJar, json: { resultType: "road", resultNumber: "E2E-R1", progress: [{ statusId: roadStatusCatalog[0].id, completedAt: "2026-07-26T10:00:00.000Z", cost: 2400 }] } });
  const editorResultProgress = await request("/api/result-status-progress", { method: "PUT", jar: userJar, json: { resultType: "road", resultNumber: "e2e-r1", progress: [{ statusId: roadStatusCatalog[0].id, completedAt: "2026-07-27T10:00:00.000Z", cost: 999999 }] } });
  assert(editorResultProgress.payload[0]?.completedAt === "2026-07-27T10:00:00.000Z" && !("cost" in editorResultProgress.payload[0]), "Editor result-stage response leaked expenses or failed to update the date.");
  const storedResultProgress = await client.query("select cost, completed_at as \"completedAt\" from result_status_progress where workspace = 'sandbox' and result_type = 'road' and result_number = 'e2e-r1' and status_id = $1", [roadStatusCatalog[0].id]);
  assert(Number(storedResultProgress.rows[0]?.cost) === 2400 && storedResultProgress.rows[0]?.completedAt?.toISOString() === "2026-07-27T10:00:00.000Z", "Editor overwrote protected result expenses or the result context was not persisted.");
  const editorAudit = await request("/api/audit?limit=100", { jar: userJar });
  const resultAudit = editorAudit.payload.items?.find((item) => item.action === "result-status-progress.updated");
  assert(resultAudit && !JSON.stringify(resultAudit.details).includes("2400") && !JSON.stringify(resultAudit.details).includes('"cost"'), "Editor audit response leaked result-stage expenses.");
  const categoryRows = await client.query("select id, name, description, color, visible from category where workspace = 'sandbox' order by id");
  const categoryCatalog = Object.fromEntries(categoryRows.rows.map((item) => [item.id, { name: item.name, description: item.description, color: item.color, visible: item.visible }]));
  await request("/api/categories", {
    method: "PUT",
    jar: adminJar,
    json: { ...categoryCatalog, [categoryId]: { name: "E2E category", description: `  ${categoryDescription}  `, color: "#3979a8", visible: true } },
  });
  const savedCategory = await client.query("select description from category where workspace = 'sandbox' and id = $1", [categoryId]);
  assert(savedCategory.rows[0]?.description === categoryDescription, "Category description was not normalized and persisted.");
  await request("/api/categories", { method: "PUT", jar: adminJar, json: categoryCatalog });
  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "PATCH", jar: userJar, json: testPlot("Updated by E2E user") });
  const audit = await request(`/api/audit?q=${encodeURIComponent(cadastralNumber)}&scope=plots&limit=30`, { jar: userJar });
  const updatedAudit = audit.payload.items?.filter((item) => item.action === "plot.updated" && item.entityId === plotId).at(-1);
  assert(updatedAudit?.id && updatedAudit.canRestore, "Updated plot version is missing from the audit log.");

  await request(`/api/audit/${updatedAudit.id}/restore`, { method: "POST", jar: userJar, expected: [403] });
  await request("/api/import", { method: "POST", jar: userJar, expected: [403], form: new FormData() });
  await request("/api/categories", { method: "PUT", jar: userJar, expected: [403], json: {} });
  await request(`/api/plots/${encodeURIComponent(plotId)}`, { method: "DELETE", jar: userJar, expected: [403] });
  await request(`/api/audit/${updatedAudit.id}/restore`, { method: "POST", jar: adminJar, expected: [200] });
  const restoredPlots = await request("/api/plots", { jar: userJar });
  const restored = restoredPlots.payload.find((item) => item.properties?.id === plotId);
  assert(restored?.properties?.name === "Staging E2E plot", "Administrator restore did not recover the prior plot version.");
  logStep("read-only default, editor grant, workspace isolation, CRUD, audit, restore and role permissions passed");

  await request(`/api/admin/users/${applicant.id}`, {
    method: "PATCH",
    jar: adminJar,
    json: { role: "user", accessLevel: "read", approvalStatus: "suspended" },
  });
  await request("/api/plots", { jar: userJar, expected: [401] });
  await request(`/api/admin/users/${admin.id}`, {
    method: "PATCH",
    jar: adminJar,
    expected: [409],
    json: { role: "user", accessLevel: "read", approvalStatus: "suspended" },
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
      const users = await client.query(`select id from "user" where email = any($1::text[])`, [testEmails]);
      const userIds = users.rows.map((row) => row.id);
      if (snapshotIds.length) await client.query("delete from workspace_snapshot where id = any($1::uuid[])", [snapshotIds]);
      await client.query(
        `delete from plot_version
          where plot_id = $1
             or created_by = any($2::text[])
             or audit_log_id in (select id from audit_log where entity_id = $1 or actor_user_id = any($2::text[]))`,
        [plotId, userIds],
      );
      await client.query(`delete from audit_log where entity_id = $1 or actor_user_id = any($2::text[])`, [plotId, userIds]);
      await client.query(`delete from result_status_progress where workspace = 'sandbox' and result_number like 'E2E-%'`);
      await client.query(`delete from plot where workspace = 'sandbox' and id = $1`, [plotId]);
      await client.query(`delete from plot_status where workspace = 'sandbox' and id = $1`, [statusId]);
      await client.query(
        `delete from notification_outbox
          where recipient = any($1::text[])
             or payload::text like $2`,
        [testEmails, `%${runId}%`],
      );
      await client.query(`delete from verification where identifier like $1`, [`%${runId}%`]);
      await client.query("delete from category where id = $1", [categoryId]);
      await client.query(`delete from "user" where email = any($1::text[])`, [testEmails]);
      await client.query("commit");
      const residue = await client.query(
        `select
           (select count(*) from "user" where email = any($1::text[]))::int as users,
           (select count(*) from plot where id = $2)::int as plots,
           (select count(*) from audit_log where entity_id = $2)::int as audits,
           (select count(*) from workspace_snapshot where id = $3)::int as snapshots`,
        [testEmails, plotId, snapshotId],
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
