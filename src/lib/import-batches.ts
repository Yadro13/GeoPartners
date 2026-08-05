import { IMPORT_UPLOAD_LIMITS } from "@/lib/import-limits";
import { packFileGroupsByLimits } from "@/lib/file-batching";

export function packImportFileGroups(groups: File[][]): File[][] {
  return packFileGroupsByLimits(groups, { files: IMPORT_UPLOAD_LIMITS.files, bytes: IMPORT_UPLOAD_LIMITS.packageBytes });
}

export function packImportFiles(files: File[]) {
  return packImportFileGroups(files.map((file) => [file]));
}
