import pg from "pg";
import {
  createS3Client,
  findLatestBackup,
  requireEnvironment,
  runCommand,
} from "./backup-utils.mjs";

const { Client } = pg;
requireEnvironment(["DATABASE_URL"]);

const sourceUrl = new URL(process.env.DATABASE_URL);
const databaseName = `geopartners_restore_drill_${Date.now()}`;
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: sourceUrl.toString() });
let created = false;

try {
  const s3 = createS3Client();
  const latest = await findLatestBackup(s3, process.env.AWS_S3_BUCKET_NAME);

  await admin.connect();
  await admin.query(`create database ${quoteIdentifier(databaseName)}`);
  created = true;
  console.info(`Temporary restore database created: ${databaseName}`);

  await runCommand(process.execPath, [
    "scripts/restore-database.mjs",
    "--key",
    latest.key,
  ], {
    env: {
      ...process.env,
      RESTORE_DATABASE_URL: targetUrl.toString(),
      RESTORE_CONFIRM_DATABASE: databaseName,
    },
  });

  console.info(JSON.stringify({
    status: "drill-complete",
    source: latest.key,
    targetDatabase: databaseName,
  }));
} finally {
  if (created) {
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await admin.query(`drop database if exists ${quoteIdentifier(databaseName)}`);
    console.info(`Temporary restore database removed: ${databaseName}`);
  }
  await admin.end().catch(() => undefined);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
