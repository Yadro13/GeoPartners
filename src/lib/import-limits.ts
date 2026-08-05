export const IMPORT_UPLOAD_LIMITS = {
  // These limits apply to one technical request. The UI splits larger selections.
  files: 60,
  fileBytes: 20 * 1024 * 1024,
  packageBytes: 100 * 1024 * 1024,
  selectionBytes: 500 * 1024 * 1024,
  archives: 5,
  archiveEntries: 5000,
} as const;
