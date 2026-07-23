import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const localRoot = path.join(process.cwd(), ".local-storage");

function getBucketConfig() {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, client: new S3Client({ endpoint, region: process.env.AWS_DEFAULT_REGION || "auto", forcePathStyle: process.env.AWS_S3_URL_STYLE === "path", credentials: { accessKeyId, secretAccessKey } }) };
}

export async function putDocument(key: string, body: Buffer) {
  const remote = getBucketConfig();
  if (remote) {
    await remote.client.send(new PutObjectCommand({ Bucket: remote.bucket, Key: key, Body: body, ContentType: "application/pdf" }));
    return;
  }
  assertLocalStorage();
  const target = localPath(key); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, body);
}

export async function getDocument(key: string) {
  const remote = getBucketConfig();
  if (remote) {
    const response = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }));
    if (!response.Body) throw new Error("Документ не знайдено.");
    return Buffer.from(await response.Body.transformToByteArray());
  }
  assertLocalStorage();
  return readFile(localPath(key));
}

export async function deleteDocument(key: string) {
  const remote = getBucketConfig();
  if (remote) { await remote.client.send(new DeleteObjectCommand({ Bucket: remote.bucket, Key: key })); return; }
  if (process.env.NODE_ENV === "production") return;
  await unlink(localPath(key)).catch(() => undefined);
}

function assertLocalStorage() {
  if (process.env.NODE_ENV === "production") throw new Error("Railway Bucket не налаштовано для зберігання PDF.");
}
function localPath(key: string) { return path.join(localRoot, ...key.split("/").filter((part) => part && part !== "." && part !== "..")); }
