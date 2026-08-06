import type { CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "@/components/workspace/types";
import type { LandDocumentMetadata } from "@/lib/pdf-metadata";
import { packImportFileGroups, packImportFiles } from "@/lib/import-batches";
import { categoriesWithDefaults, normalizeImport } from "@/lib/plot-data";
import { calculatePolygonAreaHa, findPlotConflicts, repairPolygonGeometry, validatePolygonGeometry, type GeometryRepairAction, type GeometryValidationIssue, type GeometryValidationMarker, type PlotConflict } from "@/lib/geometry";

export type ImportIssue = { level: "warning" | "error"; message: string; code?: string; values?: Record<string, string | number>; dedupeKey?: string };
export type ImportCandidate = {
  key: string;
  included: boolean;
  geoName: string;
  pdfName: string | null;
  plot: PlotFeature;
  action: "create" | "update";
  coordinateCount: number;
  sourceIssues: ImportIssue[];
  issues: ImportIssue[];
  conflicts: PlotConflict[];
  geometryIssues: GeometryValidationIssue[];
  validationMarkers: GeometryValidationMarker[];
  repairActions: GeometryRepairAction[];
  appliedRepairs: GeometryRepairAction[];
};
export type ImportReview = {
  candidates: ImportCandidate[];
  categories: Record<string, CategoryDefinition>;
  packageIssues: ImportIssue[];
  blockingCount: number;
  warningCount: number;
};

type InspectedDocument = { name: string; stem: string; metadata: LandDocumentMetadata };

export async function inspectImportPackage(files: File[], existingPlots: PlotFeature[], currentCategories: Record<string, CategoryDefinition>): Promise<ImportReview> {
  const geoFiles = files.filter((file) => /\.(geo)?json$/i.test(file.name));
  const pdfFiles = files.filter((file) => /\.pdf$/i.test(file.name));
  const documents = await inspectPdfFiles(pdfFiles);
  const candidates: ImportCandidate[] = []; const packageIssues: ImportIssue[] = []; const importedCategories: Record<string, CategoryDefinition> = {};

  for (const file of geoFiles) {
    try {
      const parsed = normalizeImport(JSON.parse(await file.text()), file.name);
      Object.assign(importedCategories, parsed.categories);
      parsed.skipped.forEach((message) => packageIssues.push({ level: "warning", message: `${message} Об'єкт пропущено.`, code: "object-skipped" }));
      for (const original of parsed.plots) {
        const issues: ImportIssue[] = []; const geoDigits = digits(original.properties.cadastralNumber); const geoStem = stem(file.name);
        const byStem = documents.find((document) => document.stem === geoStem);
        const byCad = documents.find((document) => digits(document.metadata.cadastralNumber) === geoDigits && geoDigits.length === 19);
        const document = byCad ?? byStem ?? null;
        if (document && geoDigits.length === 19 && document.metadata.cadastralNumber && digits(document.metadata.cadastralNumber) !== geoDigits) issues.push({ level: "error", message: `Кадастровий номер не збігається з ${document.name}.`, code: "cad-mismatch", values: { name: document.name } });
        const metadata = document?.metadata;
        const plot: PlotFeature = { ...original, properties: { ...original.properties,
          cadastralNumber: metadata?.cadastralNumber || original.properties.cadastralNumber,
          areaHa: metadata?.areaHa || original.properties.areaHa,
          owner: metadata?.owner || original.properties.owner,
          lessee: metadata?.lessee || original.properties.lessee,
          documentActualAt: metadata?.documentActualAt || original.properties.documentActualAt,
          documentName: document?.name,
          hasDocument: Boolean(document),
        } };
        const finalDigits = digits(plot.properties.cadastralNumber);
        if (finalDigits.length !== 19) issues.push({ level: "error", message: "Не вдалося визначити повний кадастровий номер.", code: "invalid-cad" });
        const existing = existingPlots.find(({ properties }) => digits(properties.cadastralNumber) === finalDigits && finalDigits.length === 19);
        if (existing) {
          plot.properties.id = existing.properties.id;
          if (!(plot.properties.resultLinks?.length)) plot.properties.resultLinks = existing.properties.resultLinks ?? [];
          if (!document) Object.assign(plot.properties, {
            owner: plot.properties.owner || existing.properties.owner,
            lessee: plot.properties.lessee || existing.properties.lessee,
            documentActualAt: plot.properties.documentActualAt || existing.properties.documentActualAt,
          });
        }
        candidates.push({ key: `${file.name}-${plot.properties.id}`, included: true, geoName: file.name, pdfName: document?.name ?? null, plot, action: existing ? "update" : "create", coordinateCount: plot.geometry.coordinates.reduce((count, ring) => count + ring.length, 0), sourceIssues: issues, issues: [], conflicts: [], geometryIssues: [], validationMarkers: [], repairActions: [], appliedRepairs: [] });
      }
    } catch (error) { packageIssues.push({ level: "error", message: `${file.name}: ${error instanceof Error ? error.message : "не вдалося прочитати GeoJSON"}`, code: "geo-read", values: { name: file.name } }); }
  }

  const usedPdfs = new Set(candidates.flatMap((candidate) => candidate.pdfName ? [candidate.pdfName] : []));
  documents.filter((document) => !usedPdfs.has(document.name)).forEach((document) => packageIssues.push({ level: "warning", message: `${document.name}: немає відповідного GeoJSON.`, code: "pdf-unmatched", values: { name: document.name } }));
  if (!candidates.length) packageIssues.push({ level: "error", message: "У пакеті немає придатних ділянок.", code: "no-plots" });
  return finalizeReview(candidates, categoriesWithDefaults({ ...currentCategories, ...importedCategories }), packageIssues, existingPlots);
}

export function applySafeGeometryRepairs(review: ImportReview, existingPlots: PlotFeature[]) {
  const candidates = review.candidates.map((candidate) => {
    if (!candidate.included) return candidate;
    const repair = repairPolygonGeometry(candidate.plot.geometry);
    if (!repair.actions.length) return candidate;
    return {
      ...candidate,
      plot: {
        ...candidate.plot,
        geometry: repair.geometry,
        properties: { ...candidate.plot.properties, areaHa: calculatePolygonAreaHa(repair.geometry) },
      },
      appliedRepairs: [...candidate.appliedRepairs, ...repair.actions],
    };
  });
  return finalizeReview(candidates, review.categories, review.packageIssues, existingPlots);
}

export function setImportCandidateIncluded(review: ImportReview, key: string, included: boolean, existingPlots: PlotFeature[]) {
  const candidates = review.candidates.map((candidate) => candidate.key === key ? { ...candidate, included } : candidate);
  return finalizeReview(candidates, review.categories, review.packageIssues, existingPlots);
}

export function setAllImportCandidatesIncluded(review: ImportReview, included: boolean, existingPlots: PlotFeature[]) {
  const candidates = review.candidates.map((candidate) => ({ ...candidate, included }));
  return finalizeReview(candidates, review.categories, review.packageIssues, existingPlots);
}

export function buildReviewedImportBatches(review: ImportReview, files: File[]) {
  const included = review.candidates.filter(({ included }) => included);
  const byName = new Map(files.map((file) => [file.name, file]));
  const sourceCounts = Map.groupBy(included, ({ geoName }) => geoName);
  const sourceIndexes = new Map<string, number>();
  const groups = included.map((candidate) => {
    const source = byName.get(candidate.geoName);
    if (!source) throw new Error(`${candidate.geoName}: вихідний GeoJSON не знайдено.`);
    const index = (sourceIndexes.get(candidate.geoName) ?? 0) + 1;
    sourceIndexes.set(candidate.geoName, index);
    const geoName = sourceCounts.get(candidate.geoName)!.length > 1 ? indexedGeoName(candidate.geoName, index) : candidate.geoName;
    const content = JSON.stringify({ type: "FeatureCollection", categories: review.categories, features: [candidate.plot] });
    const geo = new File([content], geoName, { type: "application/geo+json", lastModified: source.lastModified });
    const pdf = candidate.pdfName ? byName.get(candidate.pdfName) : undefined;
    return pdf ? [geo, pdf] : [geo];
  });
  return packImportFileGroups(groups);
}

function finalizeReview(candidates: ImportCandidate[], categories: Record<string, CategoryDefinition>, packageIssues: ImportIssue[], existingPlots: PlotFeature[]): ImportReview {
  const includedCandidates = candidates.filter(({ included }) => included);
  const includedIds = new Set(includedCandidates.map(({ plot }) => plot.properties.id));
  const inspectOverlaps = includedCandidates.length * (existingPlots.length + includedCandidates.length) <= 20_000;
  const cadastralGroups = Map.groupBy(includedCandidates, (candidate) => digits(candidate.plot.properties.cadastralNumber));
  const finalPlots = new Map(existingPlots.map((plot) => [plot.properties.id, plot]));
  for (const candidate of includedCandidates) finalPlots.set(candidate.plot.properties.id, candidate.plot);
  const finalized = candidates.map((candidate) => {
    const validation = validatePolygonGeometry(candidate.plot.geometry); const repair = repairPolygonGeometry(candidate.plot.geometry);
    const duplicate = digits(candidate.plot.properties.cadastralNumber); const duplicateIssues: ImportIssue[] = candidate.included && duplicate.length === 19 && (cadastralGroups.get(duplicate)?.length ?? 0) > 1 ? [{ level: "error", message: "Цей кадастровий номер повторюється у пакеті.", code: "duplicate-cad" }] : [];
    const next: ImportCandidate = { ...candidate, coordinateCount: candidate.plot.geometry.coordinates.reduce((count, ring) => count + ring.length, 0), issues: [...candidate.sourceIssues, ...duplicateIssues, ...validation.issues.map(({ level, message, code }) => ({ level, message, code: `geometry-${code}` }))], conflicts: [], geometryIssues: validation.issues, validationMarkers: validation.markers, repairActions: repair.actions };
    if (!candidate.included || !inspectOverlaps) return next;
    if (validation.issues.some(({ level }) => level === "error")) return next;
    const neighbors = [...finalPlots.values()].filter(({ properties }) => properties.id !== candidate.plot.properties.id);
    next.conflicts = findPlotConflicts(candidate.plot.geometry, neighbors);
    for (const conflict of next.conflicts) {
      const pairKey = [candidate.plot.properties.id, conflict.plotId].sort().join(":");
      const source = includedIds.has(conflict.plotId) ? "між файлами пакета" : "з ділянкою у поточній базі";
      const label = conflict.scale === "micro" ? "Мікронакладання" : "Накладання";
      next.issues.push({ level: "warning", code: "overlap", values: { area: conflict.overlapAreaSquareMeters, cadastral: conflict.cadastralNumber, source: includedIds.has(conflict.plotId) ? "package" : "database", scale: conflict.scale }, dedupeKey: `overlap:${pairKey}`, message: `${label} ${formatSquareMeters(conflict.overlapAreaSquareMeters)} з ${conflict.cadastralNumber} · ${source}. Координати буде збережено без змін.` });
    }
    return next;
  });
  const allIssues = [...packageIssues, ...finalized.filter(({ included }) => included).flatMap(({ issues }) => issues)];
  return { candidates: finalized, categories, packageIssues, blockingCount: countIssues(allIssues, "error"), warningCount: countIssues(allIssues, "warning") };
}

async function inspectPdfFiles(files: File[]): Promise<InspectedDocument[]> {
  if (!files.length) return [];
  const documents: InspectedDocument[] = [];
  for (const batch of packImportFiles(files)) {
    const form = new FormData(); batch.forEach((file) => form.append("files", file));
    const response = await fetch("/api/import/inspect", { method: "POST", body: form }); const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Не вдалося проаналізувати PDF.");
    documents.push(...body.documents as InspectedDocument[]);
  }
  return documents;
}

function stem(name: string) { return name.replace(/\.(pdf|geojson|json)$/i, "").toLocaleLowerCase(); }
function indexedGeoName(name: string, index: number) { return name.replace(/\.(geo)?json$/i, `-${index}.geojson`); }
function digits(value: string) { return value.replace(/\D/g, ""); }
function formatSquareMeters(areaSquareMeters: number) { return `${areaSquareMeters.toLocaleString("uk-UA", { minimumFractionDigits: areaSquareMeters < 1 ? 2 : 0, maximumFractionDigits: 2 })} м²`; }
function countIssues(issues: ImportIssue[], level: ImportIssue["level"]) {
  const seen = new Set<string>(); let count = 0;
  for (const issue of issues) {
    if (issue.level !== level) continue;
    if (issue.dedupeKey) {
      if (seen.has(issue.dedupeKey)) continue;
      seen.add(issue.dedupeKey);
    }
    count += 1;
  }
  return count;
}
