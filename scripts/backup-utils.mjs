import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";

export const coreTables = [
  "user",
  "account",
  "registration_request",
  "category",
  "plot",
  "audit_log",
  "plot_version",
];

export function createS3Client() {
  requireEnvironment([
    "AWS_ENDPOINT_URL",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET_NAME",
  ]);

  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION ?? "auto",
    forcePathStyle: process.env.AWS_S3_URL_STYLE === "path",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export async function findLatestBackup(s3, bucket) {
  let continuationToken;
  let latest;

  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "backups/database/",
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      if (!object.Key || !object.LastModified) continue;
      if (!latest || object.LastModified > latest.lastModified) {
        latest = {
          key: object.Key,
          lastModified: object.LastModified,
          size: object.Size ?? 0,
        };
      }
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  if (!latest) throw new Error("No database backups were found in object storage.");
  return latest;
}

export async function downloadBackup(s3, bucket, key, destination) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`Backup object ${key} has no body.`);
  await pipeline(response.Body, createWriteStream(destination));
}

export async function inspectBackup(file) {
  const info = await stat(file);
  if (info.size === 0) throw new Error("Backup archive is empty.");

  const { stdout } = await runCommand("pg_restore", ["--list", file], { capture: true });
  const missingTables = coreTables.filter((table) => {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`\\bTABLE(?: DATA)?\\s+public\\s+${escaped}\\b`).test(stdout);
  });

  if (missingTables.length) {
    throw new Error(`Backup archive is missing required tables: ${missingTables.join(", ")}.`);
  }

  return {
    bytes: info.size,
    requiredTables: coreTables,
  };
}

export function requireEnvironment(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`);
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const capture = Boolean(options.capture);
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    });
    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}
