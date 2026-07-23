import { IMPORT_UPLOAD_LIMITS } from "@/lib/import-limits";

type UploadKind = "package" | "pdf";

export function validateUploadFiles(files: File[], kind: UploadKind = "package") {
  if (!files.length) throw new Error("Файли не вибрано.");
  if (files.length > IMPORT_UPLOAD_LIMITS.files) throw new Error(`За один раз можна завантажити не більше ${IMPORT_UPLOAD_LIMITS.files} файлів.`);

  let totalBytes = 0;
  for (const file of files) {
    const supported = kind === "pdf" ? /\.pdf$/i.test(file.name) : /\.(pdf|json|geojson)$/i.test(file.name);
    if (!supported) throw new Error(`${file.name}: непідтримуваний формат.`);
    if (!file.size) throw new Error(`${file.name}: файл порожній.`);
    if (file.size > IMPORT_UPLOAD_LIMITS.fileBytes) throw new Error(`${file.name}: розмір перевищує 20 МБ.`);
    totalBytes += file.size;
  }

  if (totalBytes > IMPORT_UPLOAD_LIMITS.packageBytes) throw new Error("Загальний розмір пакета перевищує 100 МБ.");
}

export async function readPdfBuffer(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error(`${file.name}: вміст файлу не відповідає формату PDF.`);
  return buffer;
}
