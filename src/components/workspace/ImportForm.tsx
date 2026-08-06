"use client";

import { useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, FileArchive, FileJson, FileText, FolderOpen, ListChecks, LocateFixed, RefreshCw, RotateCcw, Square, Upload, WandSparkles, XCircle } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { expandImportSelection } from "@/lib/import-archive";
import { applySafeGeometryRepairs, buildReviewedImportBatches, inspectImportPackage, setAllImportCandidatesIncluded, setImportCandidateIncluded, setImportDocumentResolution, setImportFieldResolution, type ImportIssue, type ImportReview } from "@/lib/import-review";
import type { ImportConflictField, ImportResolution } from "@/lib/import-merge";
import type { CategoryDefinition } from "@/data/demo";
import type { BaseMapId, PlotFeature } from "./types";

export function ImportForm({ onImport, onCancel, existingPlots, categories, baseMap }: { onImport: (batches: File[][], onProgress: (completed: number, total: number) => void) => Promise<void>; onCancel: () => void; existingPlots: PlotFeature[]; categories: Record<string, CategoryDefinition>; baseMap: BaseMapId }) {
  const t = useTranslations("importUi");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null); const directoryInput = useRef<HTMLInputElement>(null); const [files, setFiles] = useState<File[]>([]); const [archiveNames, setArchiveNames] = useState<string[]>([]); const [skippedEntries, setSkippedEntries] = useState<string[]>([]); const [review, setReview] = useState<ImportReview | null>(null); const [repairBackup, setRepairBackup] = useState<ImportReview | null>(null); const [selectedId, setSelectedId] = useState<string | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const geoCount = files.filter((file) => /\.(geo)?json$/i.test(file.name)).length; const pdfCount = files.filter((file) => /\.pdf$/i.test(file.name)).length;
  const analyze = async () => { setError(""); setProgress(null); setLoading(true); try { if (!geoCount) throw new Error(t("addGeoJson")); const result = await inspectImportPackage(files, existingPlots, categories); setReview(result); setRepairBackup(null); setSelectedId(result.candidates[0]?.plot.properties.id ?? null); } catch (reason) { setError(reason instanceof Error ? reason.message : t("analyzeFailed")); } finally { setLoading(false); } };
  const confirm = async () => { if (!review) return; setError(""); setLoading(true); try { const batches = buildReviewedImportBatches(review, files); const completedBefore = progress?.total === batches.length ? progress.completed : 0; const pending = batches.slice(completedBefore); await onImport(pending, (completed) => setProgress({ completed: completedBefore + completed, total: batches.length })); } catch (reason) { setError(reason instanceof Error ? reason.message : t("importFailed")); setLoading(false); } };
  const selectFiles = async (next: File[]) => {
    setReview(null); setRepairBackup(null); setProgress(null); setError(""); setLoading(true);
    try {
      const expanded = await expandImportSelection(next);
      setFiles(expanded.files); setArchiveNames(expanded.archiveNames); setSkippedEntries(expanded.skippedEntries);
    } catch (reason) {
      setFiles([]); setArchiveNames([]); setSkippedEntries([]); setError(reason instanceof Error ? reason.message : t("unpackFailed"));
    } finally {
      setLoading(false);
    }
  };
  const changeFiles = () => { setReview(null); setRepairBackup(null); setProgress(null); };
  const applyRepairs = () => { if (!review) return; setProgress(null); setRepairBackup(review); setReview(applySafeGeometryRepairs(review, existingPlots)); };
  const undoRepairs = () => { if (!repairBackup) return; setProgress(null); setReview(repairBackup); setRepairBackup(null); };
  const toggleCandidate = (key: string, included: boolean) => { if (!review) return; setProgress(null); const next = setImportCandidateIncluded(review, key, included, existingPlots); setReview(next); if (!included && review.candidates.find((candidate) => candidate.key === key)?.plot.properties.id === selectedId) setSelectedId(next.candidates.find((candidate) => candidate.included)?.plot.properties.id ?? null); if (repairBackup) setRepairBackup(setImportCandidateIncluded(repairBackup, key, included, existingPlots)); };
  const toggleAllCandidates = (included: boolean) => { if (!review) return; setProgress(null); const next = setAllImportCandidatesIncluded(review, included, existingPlots); setReview(next); setSelectedId(included ? next.candidates[0]?.plot.properties.id ?? null : null); if (repairBackup) setRepairBackup(setAllImportCandidatesIncluded(repairBackup, included, existingPlots)); };

  if (review) {
    const includedCandidates = review.candidates.filter(({ included }) => included); const includedCount = includedCandidates.length;
    const candidatePlots = review.candidates.map(({ plot }) => plot); const createCount = includedCandidates.filter(({ action }) => action === "create").length; const updateCount = includedCount - createCount; const selected = review.candidates.find(({ plot }) => plot.properties.id === selectedId) ?? review.candidates[0];
    const includedIds = new Set(includedCandidates.map(({ plot }) => plot.properties.id));
    const conflictPairs = uniqueConflictPairs(includedCandidates, includedIds);
    const conflictIds = [...new Set(includedCandidates.flatMap((candidate) => candidate.conflicts.flatMap(({ plotId }) => [candidate.plot.properties.id, plotId])))];
    const mapPlotsById = new Map(candidatePlots.map((plot) => [plot.properties.id, plot]));
    for (const id of conflictIds) { const existing = existingPlots.find(({ properties }) => properties.id === id); if (existing && !mapPlotsById.has(id)) mapPlotsById.set(id, existing); }
    const overlapFeatures = conflictPairs.map(({ conflict }) => ({ type: "Feature" as const, properties: {}, geometry: conflict.geometry }));
    const conflictCount = conflictPairs.length; const firstConflict = conflictPairs[0]; const dataConflictCount = includedCandidates.reduce((count, candidate) => count + candidate.dataConflicts.length + (candidate.documentConflict ? 1 : 0), 0);
    const validationMarkers = includedCandidates.flatMap(({ validationMarkers }) => validationMarkers);
    const geometryProblemCount = includedCandidates.filter(({ geometryIssues }) => geometryIssues.some(({ level }) => level === "error")).length;
    const repairable = includedCandidates.filter(({ repairActions }) => repairActions.length > 0); const appliedRepairs = includedCandidates.flatMap(({ appliedRepairs }) => appliedRepairs);
    return <div className="import-review">
      <div className="import-review__summary"><span><strong>{includedCount}/{review.candidates.length}</strong> {t("selected")}</span><span><strong>{createCount}</strong> {t("newItems")}</span><span><strong>{updateCount}</strong> {t("updates")}</span><span data-tone={dataConflictCount ? "warning" : "ok"}><strong>{dataConflictCount}</strong> {t("dataConflicts")}</span><span data-tone={geometryProblemCount ? "error" : "ok"}><strong>{geometryProblemCount}</strong> {t("geometryProblems")}</span><span data-tone={conflictCount ? "warning" : "ok"}><strong>{conflictCount}</strong> {t("overlaps")}</span><span data-tone={review.warningCount ? "warning" : "ok"}><strong>{review.warningCount}</strong> {t("warnings")}</span><span data-tone={review.blockingCount ? "error" : "ok"}><strong>{review.blockingCount}</strong> {t("errors")}</span></div>
      {firstConflict ? <div className="import-conflict-guide" role="status"><AlertTriangle size={20} /><div><strong>{t("overlapsAllowed")}</strong><span>{formatConflictGuide(conflictPairs, t, format.number)}</span><small>{t("noOverlapAction")}</small></div><div className="import-conflict-guide__actions"><button type="button" onClick={() => setSelectedId(firstConflict.candidateId)}><LocateFixed size={16} />{t("showOnMap")}</button></div></div> : null}
      {repairable.length ? <div className="import-repair" data-tone="available"><WandSparkles size={20} /><div><strong>{t("safeRepairs")}</strong><span>{summarizeRepairs(repairable.flatMap(({ repairActions }) => repairActions), t)}</span></div><button type="button" onClick={applyRepairs}>{t("apply", { count: repairable.length })}</button></div> : repairBackup && appliedRepairs.length ? <div className="import-repair" data-tone="applied"><CheckCircle2 size={20} /><div><strong>{t("repairsApplied")}</strong><span>{summarizeRepairs(appliedRepairs, t)}</span></div><button type="button" onClick={undoRepairs}><RotateCcw size={16} />{t("undo")}</button></div> : null}
      <div className="import-review__layout"><div className="import-review__map">{mapPlotsById.size ? <MapCanvas plots={[...mapPlotsById.values()]} categories={review.categories} baseMap={baseMap} selectedId={selectedId} conflictIds={conflictIds} overlapFeatures={overlapFeatures} validationMarkers={validationMarkers} onSelect={(id) => { if (review.candidates.some(({ plot }) => plot.properties.id === id)) setSelectedId(id); }} /> : <div className="empty-state">{t("outlinesMissing")}</div>}</div><div className="import-review__side"><div className="import-review__selection-tools"><strong>{t("objects")}</strong><span>{t("countOf", { count: includedCount, total: review.candidates.length })}</span><button type="button" title={t("selectAll")} aria-label={t("selectAll")} disabled={includedCount === review.candidates.length} onClick={() => toggleAllCandidates(true)}><ListChecks size={17} /></button><button type="button" title={t("clearSelection")} aria-label={t("clearSelection")} disabled={!includedCount} onClick={() => toggleAllCandidates(false)}><Square size={17} /></button></div><div className="import-review__list" role="list">{review.candidates.map((candidate) => {
        const hasError = candidate.issues.some(({ level }) => level === "error"); const hasWarning = candidate.issues.some(({ level }) => level === "warning");
        return <div className="import-review__item" role="listitem" data-included={candidate.included} data-selected={selectedId === candidate.plot.properties.id} data-tone={hasError ? "error" : hasWarning ? "warning" : "ok"} key={candidate.key}><button type="button" onClick={() => setSelectedId(candidate.plot.properties.id)}><span className="import-review__state" data-tone={hasError ? "error" : hasWarning ? "warning" : "ok"}>{hasError ? <XCircle size={18} /> : hasWarning ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span><span className="import-review__data"><strong>{candidate.plot.properties.cadastralNumber}</strong><small>{candidate.action === "create" ? t("newPlot") : t("update")} · {t("points", { count: candidate.coordinateCount })}</small><small>{candidate.geoName}{candidate.pdfName ? ` + ${candidate.pdfName}` : ""}</small>{!candidate.included ? <em>{t("excluded")}</em> : candidate.issues.map((issue, index) => <em data-tone={issue.level} key={index}>{localizeImportIssue(issue, locale, t, format.number)}</em>)}</span></button><label><input type="checkbox" checked={candidate.included} onChange={(event) => toggleCandidate(candidate.key, event.target.checked)} aria-label={t("importPlot", { number: candidate.plot.properties.cadastralNumber })} /><span>{t("toImport")}</span></label></div>;
      })}</div>{selected ? <><dl className="import-review__details"><div><dt>{t("area")}</dt><dd>{t("hectares", { area: format.number(selected.plot.properties.areaHa, { maximumFractionDigits: 4 }) })}</dd></div><div><dt>{t("geometry")}</dt><dd data-tone={selected.geometryIssues.some(({ level }) => level === "error") ? "error" : "ok"}>{formatGeometryStatus(selected.geometryIssues, t)}</dd></div>{selected.repairActions.length ? <div className="import-review__details-wide"><dt>{t("repairable")}</dt><dd>{summarizeRepairs(selected.repairActions, t)}</dd></div> : null}{selected.appliedRepairs.length ? <div className="import-review__details-wide"><dt>{t("repaired")}</dt><dd>{summarizeRepairs(selected.appliedRepairs, t)}</dd></div> : null}<div><dt>{t("overlaps")}</dt><dd data-tone={selected.conflicts.length ? "warning" : "ok"}>{selected.conflicts.length ? `${selected.conflicts.length} · ${formatSquareMeters(selected.conflicts.reduce((sum, conflict) => sum + conflict.overlapAreaSquareMeters, 0), t, format.number)}` : t("none")}</dd></div><div><dt>{t("owner")}</dt><dd>{selected.plot.properties.owner || common("notDefined")}</dd></div><div><dt>{t("lessee")}</dt><dd>{selected.plot.properties.lessee || common("notDefined")}</dd></div><div><dt>{t("documentActualAt")}</dt><dd>{selected.plot.properties.documentActualAt ? format.dateTime(new Date(selected.plot.properties.documentActualAt), { dateStyle: "medium", timeStyle: "short" }) : common("notDefined")}</dd></div><div><dt>{t("document")}</dt><dd>{selected.documentConflict?.resolution === "current" ? selected.documentConflict.currentName : selected.pdfName ?? selected.plot.properties.documentName ?? t("noPdf")}</dd></div>{selected.conflicts.length ? <div className="import-review__details-wide"><dt>{t("processing")}</dt><dd>{t("keepCoordinates")}</dd></div> : null}</dl><ImportDataConflicts candidate={selected} onFieldChange={(field, resolution) => setReview((current) => current ? setImportFieldResolution(current, selected.key, field, resolution) : current)} onDocumentChange={(resolution) => setReview((current) => current ? setImportDocumentResolution(current, selected.key, resolution) : current)} /></> : null}</div></div>
      {review.packageIssues.length ? <div className="import-package-issues">{review.packageIssues.map((issue, index) => <p data-tone={issue.level} key={index}>{issue.level === "error" ? <XCircle size={16} /> : <AlertTriangle size={16} />}{localizeImportIssue(issue, locale, t, format.number)}</p>)}</div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {progress ? <p className="import-progress" role="status">{t("batchProgress", progress)}</p> : null}
      <footer className="form-actions"><button type="button" onClick={changeFiles}><RefreshCw size={17} />{t("changeFiles")}</button><span /><button className="command-button--primary" disabled={!includedCount || review.blockingCount > 0 || loading} title={review.blockingCount ? t("resolveBlocking", { count: review.blockingCount }) : undefined} type="button" onClick={confirm}>{loading ? t("saving") : t("confirmImport", { count: includedCount })}</button></footer>
    </div>;
  }

  return <div className="import-form">
    <input ref={input} hidden type="file" accept=".json,.geojson,.pdf,.zip,application/geo+json,application/json,application/pdf,application/zip" multiple onChange={(event) => { void selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <input ref={(node) => { directoryInput.current = node; node?.setAttribute("webkitdirectory", ""); }} hidden type="file" multiple onChange={(event) => { void selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <div className="import-source-actions"><button className="file-drop" disabled={loading} type="button" onClick={() => directoryInput.current?.click()}><FolderOpen size={26} /><strong>{loading ? t("preparingSelection") : t("chooseFolder")}</strong><span>{t("folderHint")}</span></button><button className="file-drop" disabled={loading} type="button" onClick={() => input.current?.click()}><Upload size={26} /><strong>{loading ? t("preparingSelection") : t("chooseFiles")}</strong><span>{t("zipHint")}</span></button></div>
    {files.length ? <><div className="import-summary">{archiveNames.length ? <span><FileArchive size={14} />{archiveNames.length} ZIP</span> : null}<span>{geoCount} GeoJSON</span><span>{pdfCount} PDF</span></div>{archiveNames.length ? <div className="import-archive-source"><FileArchive size={17} /><span>{t("unpacked", { names: archiveNames.join(", ") })}</span></div> : null}<div className="import-files">{files.slice(0, 100).map((file) => <div key={`${file.name}-${file.size}`}>{/\.pdf$/i.test(file.name) ? <FileText size={18} /> : <FileJson size={18} />}<span>{file.name}</span><small>{formatBytes(file.size, t, format.number)}</small></div>)}{files.length > 100 ? <p>{t("moreFiles", { count: files.length - 100 })}</p> : null}</div>{skippedEntries.length ? <div className="import-package-issues">{skippedEntries.map((entry) => <p data-tone="warning" key={entry}><AlertTriangle size={16} />{t("skipped", { name: entry })}</p>)}</div> : null}</> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <footer className="form-actions"><span /><button type="button" onClick={onCancel}>{common("cancel")}</button><button className="command-button--primary" disabled={!files.length || !geoCount || loading} type="button" onClick={analyze}>{loading ? t("analyzing") : t("checkPackage", { count: files.length })}</button></footer>
  </div>;
}

const conflictFieldLabelKeys = {
  owner: "owner", lessee: "lessee", documentActualAt: "documentActualAt", roadOwnershipType: "roadOwnershipType",
  servitudeValidFrom: "servitudeValidFrom", servitudeValidUntil: "servitudeValidUntil", servitudePaymentAmount: "servitudePaymentAmount",
  servitudePaymentPeriod: "servitudePaymentPeriod", substationType: "substationType", substationCapacityMw: "substationCapacityMw",
} as const;

function ImportDataConflicts({ candidate, onFieldChange, onDocumentChange }: { candidate: ImportReview["candidates"][number]; onFieldChange: (field: ImportConflictField, resolution: ImportResolution) => void; onDocumentChange: (resolution: ImportResolution) => void }) {
  const t = useTranslations("importUi"); const format = useFormatter();
  if (!candidate.dataConflicts.length && !candidate.documentConflict) return null;
  return <section className="import-data-conflicts" aria-label={t("conflictTitle")}>
    <div className="import-data-conflicts__heading"><strong>{t("conflictTitle")}</strong><span>{t("conflictPolicy")}</span></div>
    {candidate.dataConflicts.map((conflict) => <div className="import-data-conflicts__row" key={conflict.field}>
      <strong>{t(conflictFieldLabelKeys[conflict.field])}</strong>
      <div className="import-data-conflicts__choices">
        <button type="button" data-active={conflict.resolution === "current"} aria-pressed={conflict.resolution === "current"} onClick={() => onFieldChange(conflict.field, "current")}><span>{t("keepCurrent")}</span><b>{formatConflictValue(conflict.field, conflict.currentValue, format, (key) => t(key))}</b></button>
        <button type="button" data-active={conflict.resolution === "imported"} aria-pressed={conflict.resolution === "imported"} onClick={() => onFieldChange(conflict.field, "imported")}><span>{t("useImported")}</span><b>{formatConflictValue(conflict.field, conflict.importedValue, format, (key) => t(key))}</b></button>
      </div>
      <small>{t(conflict.reason === "newer-document" ? "newerPdfDefault" : conflict.reason === "not-newer-document" ? "notNewerPdfDefault" : "manualValueDefault")}</small>
    </div>)}
    {candidate.documentConflict ? <div className="import-data-conflicts__row">
      <strong>{t("document")}</strong>
      <div className="import-data-conflicts__choices">
        <button type="button" data-active={candidate.documentConflict.resolution === "current"} aria-pressed={candidate.documentConflict.resolution === "current"} onClick={() => onDocumentChange("current")}><span>{t("keepCurrent")}</span><b>{candidate.documentConflict.currentName}</b></button>
        <button type="button" data-active={candidate.documentConflict.resolution === "imported"} aria-pressed={candidate.documentConflict.resolution === "imported"} onClick={() => onDocumentChange("imported")}><span>{t("useImported")}</span><b>{candidate.documentConflict.importedName}</b></button>
      </div>
      <small>{t(candidate.documentConflict.reason === "newer-document" ? "newerPdfDefault" : "notNewerPdfDefault")}</small>
    </div> : null}
  </section>;
}

type ConflictValueKey = "ownershipPrivate" | "ownershipMunicipal" | "paymentOneTime" | "paymentMonthly" | "paymentYearly" | "paymentOther";

function formatConflictValue(field: ImportConflictField, value: string | number, format: ReturnType<typeof useFormatter>, t: (key: ConflictValueKey) => string) {
  if (field === "documentActualAt" || field === "servitudeValidFrom" || field === "servitudeValidUntil") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return format.dateTime(date, field === "documentActualAt" ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  }
  if (field === "servitudePaymentAmount" && typeof value === "number") return format.number(value, { style: "currency", currency: "UAH" });
  if (field === "substationCapacityMw" && typeof value === "number") return `${format.number(value, { maximumFractionDigits: 3 })} MW`;
  if (field === "roadOwnershipType") return t(value === "private" ? "ownershipPrivate" : "ownershipMunicipal");
  if (field === "servitudePaymentPeriod") return t(({ one_time: "paymentOneTime", monthly: "paymentMonthly", yearly: "paymentYearly", other: "paymentOther" } as const)[value as "one_time" | "monthly" | "yearly" | "other"] ?? "paymentOther");
  return String(value);
}

type ImportKey = "bytes" | "kilobytes" | "geometryErrors" | "geometryWarnings" | "geometryValid" | "closeRings" | "removeDuplicates" | "squareMeters" | "betweenFiles" | "withDatabase" | "pair" | "pairs" | "issueObjectSkipped" | "issueCadMismatch" | "issuePdfMissing" | "issueInvalidCad" | "issueGeoRead" | "issuePdfUnmatched" | "issueNoPlots" | "issueDuplicateCad" | "issueRing" | "issueCoordinates" | "issueDuplicateVertices" | "issueSelfIntersection" | "issueOgc" | "issueShortSegment" | "issueOverlap" | "microOverlap" | "overlap" | "sourcePackage" | "sourceDatabase" | "issueUnknown" | "batchProgress";
type ImportTranslator = (key: ImportKey, values?: Record<string, string | number>) => string;
type NumberFormatter = (value: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;

function formatBytes(bytes: number, t: ImportTranslator, formatNumber: NumberFormatter) { return bytes < 1024 ? t("bytes", { count: bytes }) : t("kilobytes", { count: formatNumber(bytes / 1024, { maximumFractionDigits: 1 }) }); }
function formatGeometryStatus(issues: ImportReview["candidates"][number]["geometryIssues"], t: ImportTranslator) { const errors = issues.filter(({ level }) => level === "error").length; const warnings = issues.length - errors; return errors ? `${t("geometryErrors", { count: errors })}${warnings ? `, ${t("geometryWarnings", { count: warnings })}` : ""}` : warnings ? t("geometryWarnings", { count: warnings }) : t("geometryValid"); }
function summarizeRepairs(actions: ImportReview["candidates"][number]["repairActions"], t: ImportTranslator) { const totals = Map.groupBy(actions, ({ code }) => code); return [...totals.values()].map((group) => `${t(group[0].code === "close-rings" ? "closeRings" : "removeDuplicates")}: ${group.reduce((sum, action) => sum + action.count, 0)}`).join(" · "); }
function formatSquareMeters(area: number, t: ImportTranslator, formatNumber: NumberFormatter) { return t("squareMeters", { area: formatNumber(area, { minimumFractionDigits: area < 1 ? 2 : 0, maximumFractionDigits: 2 }) }); }
function uniqueConflictPairs(candidates: ImportReview["candidates"], includedIds: Set<string>) {
  const pairs = new Map<string, { candidateId: string; conflict: ImportReview["candidates"][number]["conflicts"][number]; inBatch: boolean }>();
  for (const candidate of candidates) for (const conflict of candidate.conflicts) {
    const key = [candidate.plot.properties.id, conflict.plotId].sort().join(":");
    if (!pairs.has(key)) pairs.set(key, { candidateId: candidate.plot.properties.id, conflict, inBatch: includedIds.has(conflict.plotId) });
  }
  return [...pairs.values()];
}
function formatConflictGuide(pairs: ReturnType<typeof uniqueConflictPairs>, t: ImportTranslator, formatNumber: NumberFormatter) {
  const totalArea = pairs.reduce((sum, { conflict }) => sum + conflict.overlapAreaSquareMeters, 0);
  const batchCount = pairs.filter(({ inBatch }) => inBatch).length; const databaseCount = pairs.length - batchCount;
  const sources = [batchCount ? t("betweenFiles", { count: batchCount }) : "", databaseCount ? t("withDatabase", { count: databaseCount }) : ""].filter(Boolean).join(" · ");
  return `${pairs.length} ${t(pairs.length === 1 ? "pair" : "pairs")} · ${formatSquareMeters(totalArea, t, formatNumber)} · ${sources}.`;
}

function localizeImportIssue(issue: ImportIssue, locale: string, t: ImportTranslator, formatNumber: NumberFormatter) {
  if (locale === "uk" || !issue.code) return issue.message;
  const values = issue.values ?? {};
  const simpleKeys: Record<string, ImportKey> = {
    "object-skipped": "issueObjectSkipped", "cad-mismatch": "issueCadMismatch", "invalid-cad": "issueInvalidCad", "geo-read": "issueGeoRead", "pdf-unmatched": "issuePdfUnmatched", "no-plots": "issueNoPlots", "duplicate-cad": "issueDuplicateCad", "geometry-ring": "issueRing", "geometry-coordinates": "issueCoordinates", "geometry-duplicate": "issueDuplicateVertices", "geometry-self-intersection": "issueSelfIntersection", "geometry-ogc": "issueOgc", "geometry-short-segment": "issueShortSegment",
  };
  if (issue.code === "overlap") {
    const area = typeof values.area === "number" ? formatSquareMeters(values.area, t, formatNumber) : "";
    return t("issueOverlap", { kind: t(values.scale === "micro" ? "microOverlap" : "overlap"), area, cadastral: values.cadastral ?? "", source: t(values.source === "package" ? "sourcePackage" : "sourceDatabase") });
  }
  return t(simpleKeys[issue.code] ?? "issueUnknown", values);
}
