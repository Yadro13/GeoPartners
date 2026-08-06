import type { PlotFeature } from "@/components/workspace/types";

export const importConflictFields = [
  "owner",
  "lessee",
  "documentActualAt",
  "roadOwnershipType",
  "servitudeValidFrom",
  "servitudeValidUntil",
  "servitudePaymentAmount",
  "servitudePaymentPeriod",
  "substationType",
  "substationCapacityMw",
] as const;

export type ImportConflictField = (typeof importConflictFields)[number];
export type ImportResolution = "current" | "imported";
export type ImportDecisions = {
  fields?: Partial<Record<ImportConflictField, ImportResolution>>;
  document?: ImportResolution;
};

export type ImportFieldConflict = {
  field: ImportConflictField;
  currentValue: string | number;
  importedValue: string | number;
  defaultResolution: ImportResolution;
  resolution: ImportResolution;
  reason: "different-value" | "newer-document" | "not-newer-document";
};

export type ImportDocumentConflict = {
  currentName: string;
  importedName: string;
  defaultResolution: ImportResolution;
  resolution: ImportResolution;
  reason: "newer-document" | "not-newer-document";
};

type MergeOptions = {
  incomingDocumentName?: string | null;
  decisions?: ImportDecisions;
};

export function mergeExistingPlotForImport(imported: PlotFeature, existing: PlotFeature, options: MergeOptions = {}) {
  const decisions = options.decisions ?? imported.properties.importDecisions ?? {};
  const incomingDocumentName = options.incomingDocumentName ?? null;
  const incomingDocumentIsNewer = isStrictlyNewerDocument(imported.properties.documentActualAt, existing.properties.documentActualAt);
  const fieldConflicts: ImportFieldConflict[] = [];
  const resolvedFields = { ...decisions.fields };
  const properties = {
    ...imported.properties,
    id: existing.properties.id,
    name: existing.properties.name,
    category: existing.properties.category,
    projectCapacity: existing.properties.projectCapacity,
    mainCandidateCadastral: existing.properties.mainCandidateCadastral,
    status: existing.properties.status,
    statusProgress: existing.properties.statusProgress ?? [],
    resultLinks: existing.properties.resultLinks ?? [],
  };

  for (const field of importConflictFields) {
    const currentValue = existing.properties[field];
    const importedValue = imported.properties[field];
    if (isEmptyImportValue(importedValue)) {
      Object.assign(properties, { [field]: currentValue });
      continue;
    }
    if (isEmptyImportValue(currentValue) || importValuesEqual(field, currentValue, importedValue)) {
      Object.assign(properties, { [field]: importedValue });
      continue;
    }
    const documentField = field === "owner" || field === "lessee" || field === "documentActualAt";
    const defaultResolution: ImportResolution = documentField && incomingDocumentName && incomingDocumentIsNewer ? "imported" : "current";
    const resolution = decisions.fields?.[field] ?? defaultResolution;
    resolvedFields[field] = resolution;
    fieldConflicts.push({
      field,
      currentValue: currentValue as string | number,
      importedValue: importedValue as string | number,
      defaultResolution,
      resolution,
      reason: documentField && incomingDocumentName
        ? incomingDocumentIsNewer ? "newer-document" : "not-newer-document"
        : "different-value",
    });
    Object.assign(properties, { [field]: resolution === "imported" ? importedValue : currentValue });
  }

  const documentDefault: ImportResolution = !existing.properties.hasDocument || incomingDocumentIsNewer ? "imported" : "current";
  const documentResolution = incomingDocumentName ? decisions.document ?? documentDefault : "current";
  const documentConflict: ImportDocumentConflict | null = incomingDocumentName && existing.properties.hasDocument ? {
    currentName: existing.properties.documentName || "PDF",
    importedName: incomingDocumentName,
    defaultResolution: documentDefault,
    resolution: documentResolution,
    reason: incomingDocumentIsNewer ? "newer-document" : "not-newer-document",
  } : null;
  const includeDocument = Boolean(incomingDocumentName) && documentResolution === "imported";
  const resolvedDecisions: ImportDecisions = {
    fields: resolvedFields,
    ...(incomingDocumentName ? { document: documentResolution } : {}),
  };

  Object.assign(properties, includeDocument ? {
    documentName: incomingDocumentName ?? undefined,
    documentUrl: undefined,
    hasDocument: true,
  } : {
    documentName: existing.properties.documentName,
    documentUrl: existing.properties.documentUrl,
    hasDocument: existing.properties.hasDocument,
  }, { importDecisions: resolvedDecisions });

  return {
    plot: { ...imported, properties } as PlotFeature,
    fieldConflicts,
    documentConflict,
    includeDocument,
  };
}

export function parseImportDecisions(value: unknown): ImportDecisions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as { fields?: unknown; document?: unknown };
  const fields = source.fields && typeof source.fields === "object" && !Array.isArray(source.fields)
    ? Object.fromEntries(importConflictFields.flatMap((field) => {
      const resolution = (source.fields as Record<string, unknown>)[field];
      return resolution === "current" || resolution === "imported" ? [[field, resolution]] : [];
    })) as Partial<Record<ImportConflictField, ImportResolution>>
    : undefined;
  const document = source.document === "current" || source.document === "imported" ? source.document : undefined;
  return fields || document ? { fields, document } : undefined;
}

export function isStrictlyNewerDocument(importedValue: unknown, currentValue: unknown) {
  const importedTime = documentTime(importedValue);
  const currentTime = documentTime(currentValue);
  return importedTime !== null && currentTime !== null && importedTime > currentTime;
}

function documentTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEmptyImportValue(value: unknown) {
  return value === null || value === undefined || value === "";
}

function importValuesEqual(field: ImportConflictField, left: unknown, right: unknown) {
  if (field === "documentActualAt") {
    const leftTime = documentTime(left);
    const rightTime = documentTime(right);
    if (leftTime !== null && rightTime !== null) return leftTime === rightTime;
  }
  return String(left) === String(right);
}
