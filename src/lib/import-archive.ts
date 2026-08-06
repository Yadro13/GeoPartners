import { unzip, type UnzipFileInfo } from "fflate";
import { IMPORT_UPLOAD_LIMITS } from "@/lib/import-limits";
import { importFilePath, importPathKey, normalizeImportPath } from "@/lib/import-file-path";

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
  if (archives.reduce((sum, file) => sum + file.size, 0) > IMPORT_UPLOAD_LIMITS.selectionBytes) throw new Error("Загальний розмір вибраних ZIP-архівів перевищує 500 МБ.");

  const skippedEntries: string[] = [];
  const looseSelection = selected.filter((file) => !/\.zip$/i.test(file.name));
  looseSelection.filter((file) => !supportedEntry.test(file.name)).forEach((file) => skippedEntries.push(selectedPath(file)));
  const files = looseSelection.filter((file) => supportedEntry.test(file.name)).map(normalizeSelectedFile);
  const names = new Set<string>();
  let totalBytes = validateLooseFiles(files, names);

  for (const archive of archives) {
    if (!archive.size) throw new Error(`${archive.name}: архів порожній.`);
    if (archive.size > IMPORT_UPLOAD_LIMITS.selectionBytes) throw new Error(`${archive.name}: розмір архіву перевищує 500 МБ.`);
    const extracted = await extractArchive(archive, totalBytes, skippedEntries);
    for (const file of extracted) {
      const key = importPathKey(file.name);
      if (names.has(key)) throw new Error(`${archive.name}: файл ${file.name} дублюється у вибраному пакеті.`);
      names.add(key);
      files.push(file);
      totalBytes += file.size;
    }
  }

  if (!files.length) throw new Error("У вибраних джерелах немає GeoJSON або PDF.");
  if (totalBytes > IMPORT_UPLOAD_LIMITS.selectionBytes) throw new Error("Після розпакування загальний розмір вибраних даних перевищує 500 МБ.");

  return { files, archiveNames: archives.map(({ name }) => name), skippedEntries };
}

function validateLooseFiles(files: File[], names: Set<string>) {
  let totalBytes = 0;
  for (const file of files) {
    if (!supportedEntry.test(file.name)) throw new Error(`${file.name}: непідтримуваний формат.`);
    if (!file.size) throw new Error(`${file.name}: файл порожній.`);
    if (file.size > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${file.name}: розмір перевищує 20 МБ.`);
    const key = importPathKey(file.name);
    if (names.has(key)) throw new Error(`${file.name}: назва файлу дублюється у вибраному пакеті.`);
    names.add(key);
    totalBytes += file.size;
  }
  if (totalBytes > IMPORT_UPLOAD_LIMITS.selectionBytes) throw new Error("Загальний розмір вибраних даних перевищує 500 МБ.");
  return totalBytes;
}

async function extractArchive(archive: File, currentBytes: number, skippedEntries: string[]) {
  const data = new Uint8Array(await archive.arrayBuffer());
  if (!isZipSignature(data)) throw new Error(`${archive.name}: вміст файлу не відповідає формату ZIP.`);

  let extractedBytes = currentBytes;
  let scannedEntries = 0;
  const acceptedNames = new Set<string>();
  const entries = await unzipArchive(data, (entry) => {
    scannedEntries += 1;
    if (scannedEntries > IMPORT_UPLOAD_LIMITS.archiveEntries) throw new Error(`${archive.name}: архів містить понад ${IMPORT_UPLOAD_LIMITS.archiveEntries} записів.`);
    if (/[\\/]$/.test(entry.name)) return false;
    const path = normalizeArchivePath(entry.name, archive.name);
    if (!path || path.endsWith("/") || ignoredEntry.test(path)) return false;
    if (!supportedEntry.test(path)) {
      skippedEntries.push(`${archive.name}: ${path}`);
      return false;
    }
    if (entry.originalSize <= 0) throw new Error(`${archive.name}: файл ${path} порожній.`);
    if (entry.originalSize > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${archive.name}: файл ${path} перевищує 20 МБ після розпакування.`);
    extractedBytes += entry.originalSize;
    if (extractedBytes > IMPORT_UPLOAD_LIMITS.selectionBytes) throw new Error(`${archive.name}: після розпакування дані перевищують 500 МБ.`);
    const key = path.toLocaleLowerCase();
    if (acceptedNames.has(key)) throw new Error(`${archive.name}: шлях ${path} дублюється в архіві.`);
    acceptedNames.add(key);
    return true;
  }, archive.name);

  let actualBytes = currentBytes;
  return Object.entries(entries).map(([path, bytes]) => {
    const normalizedPath = normalizeArchivePath(path, archive.name);
    const name = `${archiveStem(archive.name)}/${normalizedPath}`;
    if (!bytes.byteLength) throw new Error(`${archive.name}: файл ${name} порожній.`);
    if (bytes.byteLength > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${archive.name}: файл ${name} перевищує 20 МБ після розпакування.`);
    actualBytes += bytes.byteLength;
    if (actualBytes > IMPORT_UPLOAD_LIMITS.selectionBytes) throw new Error(`${archive.name}: фактичний розмір розпакованих даних перевищує 500 МБ.`);
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
  try {
    return normalizeImportPath(path);
  } catch {
    throw new Error(`${archiveName}: небезпечний шлях усередині архіву.`);
  }
}

function isZipSignature(data: Uint8Array) {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && ((data[2] === 0x03 && data[3] === 0x04) || (data[2] === 0x05 && data[3] === 0x06) || (data[2] === 0x07 && data[3] === 0x08));
}

function normalizeSelectedFile(file: File) {
  const normalizedPath = importFilePath(file);
  return normalizedPath === file.name ? file : new File([file], normalizedPath, { type: file.type, lastModified: file.lastModified });
}

function selectedPath(file: File) {
  return importFilePath(file);
}

function archiveStem(name: string) {
  return name.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_") || "archive";
}

function mimeType(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.geojson$/i.test(name)) return "application/geo+json";
  return "application/json";
}
