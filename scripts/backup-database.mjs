import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { inspectBackup } from "./backup-utils.mjs";

const required = ["DATABASE_URL", "AWS_ENDPOINT_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET_NAME"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

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

try {
  await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", tempFile, process.env.DATABASE_URL]);
  const inspection = await inspectBackup(tempFile);
  console.info(`Backup archive verified: ${inspection.bytes} bytes, ${inspection.requiredTables.length} required tables`);
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(tempFile),
    ContentType: "application/octet-stream",
    Metadata: { createdAt: now.toISOString(), retentionDays: "90" },
  }));
  await removeExpiredBackups();
  console.info(`Backup uploaded: ${key}`);
} finally {
  await rm(tempFile, { force: true });
}

async function removeExpiredBackups() {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let continuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/database/", ContinuationToken: continuationToken }));
    const expired = (page.Contents ?? []).filter((object) => object.Key && object.LastModified && object.LastModified.getTime() < cutoff);
    if (expired.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: expired.map((object) => ({ Key: object.Key })) } }));
      console.info(`Removed ${expired.length} expired backup(s)`);
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
