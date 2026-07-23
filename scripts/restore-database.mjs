import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import pg from "pg";
import {
  createS3Client,
  downloadBackup,
  inspectBackup,
  runCommand,
} from "./backup-utils.mjs";

const { Client } = pg;
const options = parseArguments(process.argv.slice(2));
const targetUrl = requireUrl("RESTORE_DATABASE_URL");
const targetDatabase = decodeURIComponent(targetUrl.pathname.replace(/^\//, ""));
const confirmation = process.env.RESTORE_CONFIRM_DATABASE;

if (!targetDatabase) throw new Error("RESTORE_DATABASE_URL must include a database name.");
if (confirmation !== targetDatabase) {
  throw new Error("RESTORE_CONFIRM_DATABASE must exactly match the target database name.");
}

if (process.env.DATABASE_URL) {
  const sourceUrl = new URL(process.env.DATABASE_URL);
  if (sameDatabase(sourceUrl, targetUrl)) {
    throw new Error("Refusing to restore over DATABASE_URL. Use a separate empty drill or recovery database.");
  }
}

let file = options.file ? resolve(options.file) : null;
let temporary = false;

try {
  if (!file) {
    if (!options.key) throw new Error("Pass --file <archive> or --key <object-storage-key>.");
    const s3 = createS3Client();
    file = join(tmpdir(), `geopartners-restore-${Date.now()}.dump`);
    temporary = true;
    await downloadBackup(s3, process.env.AWS_S3_BUCKET_NAME, options.key, file);
  }

  const inspection = await inspectBackup(file);
  await runCommand("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    "--dbname",
    targetDatabase,
    file,
  ], { env: postgresEnvironment(targetUrl) });

  const client = new Client({ connectionString: targetUrl.toString() });
  await client.connect();
  try {
    const result = await client.query(
      "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])",
      [inspection.requiredTables],
    );
    if (result.rows[0].count !== inspection.requiredTables.length) {
      throw new Error("Restore completed, but one or more required tables are unavailable.");
    }
  } finally {
    await client.end();
  }

  console.info(JSON.stringify({
    status: "restored",
    targetDatabase,
    requiredTables: inspection.requiredTables,
  }));
} finally {
  if (temporary && file) await rm(file, { force: true });
}

function requireUrl(name) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
  return new URL(process.env[name]);
}

function sameDatabase(left, right) {
  return left.hostname === right.hostname
    && (left.port || "5432") === (right.port || "5432")
    && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
}

function postgresEnvironment(url) {
  const environment = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--file" || value === "--key") {
      const next = args[index + 1];
      if (!next) throw new Error(`${value} requires a value.`);
      result[value.slice(2)] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  if (result.file && result.key) throw new Error("Use either --file or --key, not both.");
  return result;
}
