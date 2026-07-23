import { unzip, type UnzipFileInfo } from "fflate";
import { IMPORT_UPLOAD_LIMITS } from "@/lib/import-limits";

export type ImportSelection = {
  files: File[];
  archiveNames: string[];
  skippedEntries: string[];
};

const supportedEntry = /\.(pdf|json|geojson)$/i;
const ignoredEntry = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/i;

export async function expandImportSelection(selected: File[]): Promise<ImportSelection> {
  if (!selected.length) return { files: [], archiveNames: [], skippedEntries: [] };

  const archives = selected.filter((file) => /\.zip$/i.test(file.name));
  if (archives.length > IMPORT_UPLOAD_LIMITS.archives) throw new Error(`За один раз можна відкрити не більше ${IMPORT_UPLOAD_LIMITS.archives} ZIP-архівів.`);
  if (archives.reduce((sum, file) => sum + file.size, 0) > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error("Загальний розмір ZIP-архівів перевищує 100 МБ.");

  const files = selected.filter((file) => !/\.zip$/i.test(file.name));
  const skippedEntries: string[] = [];
  const names = new Set<string>();
  let totalBytes = validateLooseFiles(files, names);

  for (const archive of archives) {
    if (!archive.size) throw new Error(`${archive.name}: архів порожній.`);
    if (archive.size > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error(`${archive.name}: розмір архіву перевищує 100 МБ.`);
    const extracted = await extractArchive(archive, files.length, totalBytes, skippedEntries);
    for (const file of extracted) {
      const key = file.name.toLocaleLowerCase();
      if (names.has(key)) throw new Error(`${archive.name}: файл ${file.name} дублюється у вибраному пакеті.`);
      names.add(key);
      files.push(file);
      totalBytes += file.size;
    }
  }

  if (!files.length) throw new Error("У вибраних ZIP-архівах немає GeoJSON або PDF.");
  if (files.length > IMPORT_UPLOAD_LIMITS.files) throw new Error(`Після розпакування пакет містить понад ${IMPORT_UPLOAD_LIMITS.files} файлів.`);
  if (totalBytes > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error("Після розпакування загальний розмір пакета перевищує 100 МБ.");

  return { files, archiveNames: archives.map(({ name }) => name), skippedEntries };
}

function validateLooseFiles(files: File[], names: Set<string>) {
  let totalBytes = 0;
  for (const file of files) {
    if (!supportedEntry.test(file.name)) throw new Error(`${file.name}: непідтримуваний формат.`);
    if (!file.size) throw new Error(`${file.name}: файл порожній.`);
    if (file.size > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${file.name}: розмір перевищує 20 МБ.`);
    const key = file.name.toLocaleLowerCase();
    if (names.has(key)) throw new Error(`${file.name}: назва файлу дублюється у вибраному пакеті.`);
    names.add(key);
    totalBytes += file.size;
  }
  if (files.length > IMPORT_UPLOAD_LIMITS.files) throw new Error(`За один раз можна завантажити не більше ${IMPORT_UPLOAD_LIMITS.files} файлів.`);
  if (totalBytes > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error("Загальний розмір пакета перевищує 100 МБ.");
  return totalBytes;
}

async function extractArchive(archive: File, currentCount: number, currentBytes: number, skippedEntries: string[]) {
  const data = new Uint8Array(await archive.arrayBuffer());
  if (!isZipSignature(data)) throw new Error(`${archive.name}: вміст файлу не відповідає формату ZIP.`);

  let extractedCount = currentCount;
  let extractedBytes = currentBytes;
  let scannedEntries = 0;
  const acceptedNames = new Set<string>();
  const entries = await unzipArchive(data, (entry) => {
    scannedEntries += 1;
    if (scannedEntries > 300) throw new Error(`${archive.name}: архів містить забагато службових записів.`);
    const path = normalizeArchivePath(entry.name, archive.name);
    if (!path || path.endsWith("/") || ignoredEntry.test(path)) return false;
    if (!supportedEntry.test(path)) {
      skippedEntries.push(`${archive.name}: ${path}`);
      return false;
    }
    if (entry.originalSize <= 0) throw new Error(`${archive.name}: файл ${path} порожній.`);
    if (entry.originalSize > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${archive.name}: файл ${path} перевищує 20 МБ після розпакування.`);
    extractedCount += 1;
    extractedBytes += entry.originalSize;
    if (extractedCount > IMPORT_UPLOAD_LIMITS.files) throw new Error(`${archive.name}: після розпакування пакет містить понад ${IMPORT_UPLOAD_LIMITS.files} файлів.`);
    if (extractedBytes > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error(`${archive.name}: після розпакування пакет перевищує 100 МБ.`);
    const name = basename(path);
    const key = name.toLocaleLowerCase();
    if (acceptedNames.has(key)) throw new Error(`${archive.name}: кілька файлів мають назву ${name}. Розкладіть їх в окремі архіви або перейменуйте.`);
    acceptedNames.add(key);
    return true;
  }, archive.name);

  let actualBytes = currentBytes;
  return Object.entries(entries).map(([path, bytes]) => {
    const name = basename(normalizeArchivePath(path, archive.name));
    if (!bytes.byteLength) throw new Error(`${archive.name}: файл ${name} порожній.`);
    if (bytes.byteLength > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${archive.name}: файл ${name} перевищує 20 МБ після розпакування.`);
    actualBytes += bytes.byteLength;
    if (actualBytes > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error(`${archive.name}: фактичний розмір розпакованого пакета перевищує 100 МБ.`);
    return new File([new Uint8Array(bytes).buffer], name, { type: mimeType(name), lastModified: archive.lastModified });
  });
}

function unzipArchive(data: Uint8Array, filter: (entry: UnzipFileInfo) => boolean, archiveName: string) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    try {
      unzip(data, { filter }, (error, entries) => {
        if (error) reject(new Error(`${archiveName}: не вдалося розпакувати ZIP (${error.message}).`));
        else resolve(entries);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(`${archiveName}: не вдалося розпакувати ZIP.`));
    }
  });
}

function normalizeArchivePath(path: string, archiveName: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (normalized.includes("\0") || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`${archiveName}: небезпечний шлях усередині архіву.`);
  }
  return normalized.split("/").filter((part) => part && part !== ".").join("/");
}

function basename(path: string) {
  return path.split("/").at(-1) ?? path;
}

function isZipSignature(data: Uint8Array) {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && ((data[2] === 0x03 && data[3] === 0x04) || (data[2] === 0x05 && data[3] === 0x06) || (data[2] === 0x07 && data[3] === 0x08));
}

function mimeType(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.geojson$/i.test(name)) return "application/geo+json";
  return "application/json";
}
