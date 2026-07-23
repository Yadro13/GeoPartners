import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import {
  createS3Client,
  downloadBackup,
  findLatestBackup,
  inspectBackup,
} from "./backup-utils.mjs";

const options = parseArguments(process.argv.slice(2));
let file = options.file ? resolve(options.file) : null;
let temporary = false;
let source = file;

try {
  if (!file) {
    const s3 = createS3Client();
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    const backup = options.key
      ? { key: options.key }
      : await findLatestBackup(s3, bucket);
    file = join(tmpdir(), `geopartners-verify-${Date.now()}.dump`);
    temporary = true;
    source = backup.key;
    await downloadBackup(s3, bucket, backup.key, file);
  }

  const inspection = await inspectBackup(file);
  console.info(JSON.stringify({
    status: "ok",
    source,
    bytes: inspection.bytes,
    requiredTables: inspection.requiredTables,
  }));
} finally {
  if (temporary && file) await rm(file, { force: true });
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
