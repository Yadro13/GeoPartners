import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { inspectBackup } from "./backup-utils.mjs";
import { structuredError, structuredLog } from "./structured-log.mjs";

const service = "geopartners-backup";
const required = ["DATABASE_URL", "AWS_ENDPOINT_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET_NAME"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  structuredLog(service, "error", "backup.configuration.missing", { missingCount: missing.length });
  process.exitCode = 1;
} else {
  await createBackup();
}

async function createBackup() {
  const startedAt = Date.now();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const key = `backups/database/geopartners-${stamp}.dump`;
  const tempFile = join(tmpdir(), `geopartners-${stamp}.dump`);
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const s3 = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION ?? "auto",
    forcePathStyle: process.env.AWS_S3_URL_STYLE === "path",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  structuredLog(service, "info", "backup.started", { retentionDays: 90 });
  try {
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", tempFile, process.env.DATABASE_URL]);
    const inspection = await inspectBackup(tempFile);
    structuredLog(service, "info", "backup.archive.verified", {
      bytes: inspection.bytes,
      requiredTableCount: inspection.requiredTables.length,
    });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(tempFile),
      ContentType: "application/octet-stream",
      Metadata: { createdAt: now.toISOString(), retentionDays: "90" },
    }));
    const deleted = await removeExpiredBackups(s3, bucket);
    structuredLog(service, "info", "backup.completed", {
      bytes: inspection.bytes,
      deletedExpired: deleted,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    structuredLog(service, "error", "backup.failed", { durationMs: Date.now() - startedAt, ...structuredError(error) });
    process.exitCode = 1;
  } finally {
    await rm(tempFile, { force: true });
  }
}

async function removeExpiredBackups(s3, bucket) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let continuationToken;
  let deleted = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/database/", ContinuationToken: continuationToken }));
    const expired = (page.Contents ?? []).filter((object) => object.Key && object.LastModified && object.LastModified.getTime() < cutoff);
    if (expired.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: expired.map((object) => ({ Key: object.Key })) } }));
      deleted += expired.length;
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
  return deleted;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(Object.assign(new Error("Backup command failed"), { code: `${command.toUpperCase()}_${code ?? "UNKNOWN"}` })));
  });
}
