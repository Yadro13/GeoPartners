"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileArchive, FileJson, FileText, ListChecks, LocateFixed, RefreshCw, RotateCcw, Square, Upload, WandSparkles, XCircle } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { expandImportSelection } from "@/lib/import-archive";
import { applySafeGeometryRepairs, buildReviewedImportFiles, inspectImportPackage, setAllImportCandidatesIncluded, setImportCandidateIncluded, type ImportReview } from "@/lib/import-review";
import type { CategoryDefinition } from "@/data/demo";
import type { BaseMapId, PlotFeature } from "./types";

export function ImportForm({ onImport, onCancel, existingPlots, categories, baseMap }: { onImport: (files: File[]) => Promise<void>; onCancel: () => void; existingPlots: PlotFeature[]; categories: Record<string, CategoryDefinition>; baseMap: BaseMapId }) {
  const input = useRef<HTMLInputElement>(null); const [files, setFiles] = useState<File[]>([]); const [archiveNames, setArchiveNames] = useState<string[]>([]); const [skippedEntries, setSkippedEntries] = useState<string[]>([]); const [review, setReview] = useState<ImportReview | null>(null); const [repairBackup, setRepairBackup] = useState<ImportReview | null>(null); const [selectedId, setSelectedId] = useState<string | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const geoCount = files.filter((file) => /\.(geo)?json$/i.test(file.name)).length; const pdfCount = files.filter((file) => /\.pdf$/i.test(file.name)).length;
  const analyze = async () => { setError(""); setLoading(true); try { if (!geoCount) throw new Error("Додайте GeoJSON з координатами ділянки."); const result = await inspectImportPackage(files, existingPlots, categories); setReview(result); setRepairBackup(null); setSelectedId(result.candidates[0]?.plot.properties.id ?? null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося проаналізувати файли."); } finally { setLoading(false); } };
  const confirm = async () => { if (!review) return; setError(""); setLoading(true); try { await onImport(buildReviewedImportFiles(review, files)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося імпортувати файли."); setLoading(false); } };
  const selectFiles = async (next: File[]) => {
    setReview(null); setRepairBackup(null); setError(""); setLoading(true);
    try {
      const expanded = await expandImportSelection(next);
      setFiles(expanded.files); setArchiveNames(expanded.archiveNames); setSkippedEntries(expanded.skippedEntries);
    } catch (reason) {
      setFiles([]); setArchiveNames([]); setSkippedEntries([]); setError(reason instanceof Error ? reason.message : "Не вдалося розпакувати вибрані файли.");
    } finally {
      setLoading(false);
    }
  };
  const changeFiles = () => { setReview(null); setRepairBackup(null); };
  const applyRepairs = () => { if (!review) return; setRepairBackup(review); setReview(applySafeGeometryRepairs(review, existingPlots)); };
  const undoRepairs = () => { if (!repairBackup) return; setReview(repairBackup); setRepairBackup(null); };
  const toggleCandidate = (key: string, included: boolean) => { if (!review) return; const next = setImportCandidateIncluded(review, key, included, existingPlots); setReview(next); if (!included && review.candidates.find((candidate) => candidate.key === key)?.plot.properties.id === selectedId) setSelectedId(next.candidates.find((candidate) => candidate.included)?.plot.properties.id ?? null); if (repairBackup) setRepairBackup(setImportCandidateIncluded(repairBackup, key, included, existingPlots)); };
  const toggleAllCandidates = (included: boolean) => { if (!review) return; const next = setAllImportCandidatesIncluded(review, included, existingPlots); setReview(next); setSelectedId(included ? next.candidates[0]?.plot.properties.id ?? null : null); if (repairBackup) setRepairBackup(setAllImportCandidatesIncluded(repairBackup, included, existingPlots)); };

  if (review) {
    const includedCandidates = review.candidates.filter(({ included }) => included); const includedCount = includedCandidates.length;
    const candidatePlots = review.candidates.map(({ plot }) => plot); const createCount = includedCandidates.filter(({ action }) => action === "create").length; const updateCount = includedCount - createCount; const selected = review.candidates.find(({ plot }) => plot.properties.id === selectedId) ?? review.candidates[0];
    const includedIds = new Set(includedCandidates.map(({ plot }) => plot.properties.id));
    const conflictPairs = uniqueConflictPairs(includedCandidates, includedIds);
    const conflictIds = [...new Set(includedCandidates.flatMap((candidate) => candidate.conflicts.flatMap(({ plotId }) => [candidate.plot.properties.id, plotId])))];
    const mapPlotsById = new Map(candidatePlots.map((plot) => [plot.properties.id, plot]));
    for (const id of conflictIds) { const existing = existingPlots.find(({ properties }) => properties.id === id); if (existing && !mapPlotsById.has(id)) mapPlotsById.set(id, existing); }
    const overlapFeatures = conflictPairs.map(({ conflict }) => ({ type: "Feature" as const, properties: {}, geometry: conflict.geometry }));
    const conflictCount = conflictPairs.length; const firstConflict = conflictPairs[0];
    const validationMarkers = includedCandidates.flatMap(({ validationMarkers }) => validationMarkers);
    const geometryProblemCount = includedCandidates.filter(({ geometryIssues }) => geometryIssues.some(({ level }) => level === "error")).length;
    const repairable = includedCandidates.filter(({ repairActions }) => repairActions.length > 0); const appliedRepairs = includedCandidates.flatMap(({ appliedRepairs }) => appliedRepairs);
    return <div className="import-review">
      <div className="import-review__summary"><span><strong>{includedCount}/{review.candidates.length}</strong> вибрано</span><span><strong>{createCount}</strong> нових</span><span><strong>{updateCount}</strong> оновлень</span><span data-tone={geometryProblemCount ? "error" : "ok"}><strong>{geometryProblemCount}</strong> проблем геометрії</span><span data-tone={conflictCount ? "warning" : "ok"}><strong>{conflictCount}</strong> накладань</span><span data-tone={review.warningCount ? "warning" : "ok"}><strong>{review.warningCount}</strong> попереджень</span><span data-tone={review.blockingCount ? "error" : "ok"}><strong>{review.blockingCount}</strong> помилок</span></div>
      {firstConflict ? <div className="import-conflict-guide" role="status"><AlertTriangle size={20} /><div><strong>Накладання дозволені</strong><span>{formatConflictGuide(conflictPairs)}</span><small>Додаткових дій не потрібно: усі контури буде імпортовано без зміни координат GeoJSON.</small></div><div className="import-conflict-guide__actions"><button type="button" onClick={() => setSelectedId(firstConflict.candidateId)}><LocateFixed size={16} />Показати на карті</button></div></div> : null}
      {repairable.length ? <div className="import-repair" data-tone="available"><WandSparkles size={20} /><div><strong>Безпечні виправлення</strong><span>{summarizeRepairs(repairable.flatMap(({ repairActions }) => repairActions))}</span></div><button type="button" onClick={applyRepairs}>Застосувати ({repairable.length})</button></div> : repairBackup && appliedRepairs.length ? <div className="import-repair" data-tone="applied"><CheckCircle2 size={20} /><div><strong>Виправлення застосовано</strong><span>{summarizeRepairs(appliedRepairs)}</span></div><button type="button" onClick={undoRepairs}><RotateCcw size={16} />Скасувати</button></div> : null}
      <div className="import-review__layout"><div className="import-review__map">{mapPlotsById.size ? <MapCanvas plots={[...mapPlotsById.values()]} categories={review.categories} baseMap={baseMap} selectedId={selectedId} conflictIds={conflictIds} overlapFeatures={overlapFeatures} validationMarkers={validationMarkers} onSelect={(id) => { if (review.candidates.some(({ plot }) => plot.properties.id === id)) setSelectedId(id); }} /> : <div className="empty-state">Контури не знайдено.</div>}</div><div className="import-review__side"><div className="import-review__selection-tools"><strong>Об&apos;єкти</strong><span>{includedCount} з {review.candidates.length}</span><button type="button" title="Вибрати всі" aria-label="Вибрати всі" disabled={includedCount === review.candidates.length} onClick={() => toggleAllCandidates(true)}><ListChecks size={17} /></button><button type="button" title="Зняти вибір" aria-label="Зняти вибір" disabled={!includedCount} onClick={() => toggleAllCandidates(false)}><Square size={17} /></button></div><div className="import-review__list" role="list">{review.candidates.map((candidate) => {
        const hasError = candidate.issues.some(({ level }) => level === "error"); const hasWarning = candidate.issues.some(({ level }) => level === "warning");
        return <div className="import-review__item" role="listitem" data-included={candidate.included} data-selected={selectedId === candidate.plot.properties.id} data-tone={hasError ? "error" : hasWarning ? "warning" : "ok"} key={candidate.key}><button type="button" onClick={() => setSelectedId(candidate.plot.properties.id)}><span className="import-review__state" data-tone={hasError ? "error" : hasWarning ? "warning" : "ok"}>{hasError ? <XCircle size={18} /> : hasWarning ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</span><span className="import-review__data"><strong>{candidate.plot.properties.cadastralNumber}</strong><small>{candidate.action === "create" ? "Нова ділянка" : "Оновлення"} · {candidate.coordinateCount} точок</small><small>{candidate.geoName}{candidate.pdfName ? ` + ${candidate.pdfName}` : ""}</small>{!candidate.included ? <em>Не буде імпортовано</em> : candidate.issues.map((issue, index) => <em data-tone={issue.level} key={index}>{issue.message}</em>)}</span></button><label><input type="checkbox" checked={candidate.included} onChange={(event) => toggleCandidate(candidate.key, event.target.checked)} aria-label={`Імпортувати ${candidate.plot.properties.cadastralNumber}`} /><span>До імпорту</span></label></div>;
      })}</div>{selected ? <dl className="import-review__details"><div><dt>Площа</dt><dd>{selected.plot.properties.areaHa.toLocaleString("uk-UA", { maximumFractionDigits: 4 })} га</dd></div><div><dt>Геометрія</dt><dd data-tone={selected.geometryIssues.some(({ level }) => level === "error") ? "error" : "ok"}>{formatGeometryStatus(selected.geometryIssues)}</dd></div>{selected.repairActions.length ? <div className="import-review__details-wide"><dt>Можна виправити</dt><dd>{summarizeRepairs(selected.repairActions)}</dd></div> : null}{selected.appliedRepairs.length ? <div className="import-review__details-wide"><dt>Виправлено</dt><dd>{summarizeRepairs(selected.appliedRepairs)}</dd></div> : null}<div><dt>Накладання</dt><dd data-tone={selected.conflicts.length ? "warning" : "ok"}>{selected.conflicts.length ? `${selected.conflicts.length} · ${formatSquareMeters(selected.conflicts.reduce((sum, conflict) => sum + conflict.overlapAreaSquareMeters, 0))}` : "Немає"}</dd></div><div><dt>Власник</dt><dd>{selected.plot.properties.owner || "Не визначено"}</dd></div><div><dt>Орендар</dt><dd>{selected.plot.properties.lessee || "Не визначено"}</dd></div><div><dt>Документ</dt><dd>{selected.pdfName ?? "PDF не додано"}</dd></div>{selected.conflicts.length ? <div className="import-review__details-wide"><dt>Обробка</dt><dd>Додаткових дій не потрібно. Координати буде збережено як у GeoJSON.</dd></div> : null}</dl> : null}</div></div>
      {review.packageIssues.length ? <div className="import-package-issues">{review.packageIssues.map((issue, index) => <p data-tone={issue.level} key={index}>{issue.level === "error" ? <XCircle size={16} /> : <AlertTriangle size={16} />}{issue.message}</p>)}</div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <footer className="form-actions"><button type="button" onClick={changeFiles}><RefreshCw size={17} />Змінити файли</button><span /><button className="command-button--primary" disabled={!includedCount || review.blockingCount > 0 || loading} title={review.blockingCount ? `Усуньте блокуючі проблеми: ${review.blockingCount}` : undefined} type="button" onClick={confirm}>{loading ? "Збереження…" : `Підтвердити імпорт (${includedCount})`}</button></footer>
    </div>;
  }

  return <div className="import-form">
    <input ref={input} hidden type="file" accept=".json,.geojson,.pdf,.zip,application/geo+json,application/json,application/pdf,application/zip" multiple onChange={(event) => { void selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <button className="file-drop" disabled={loading} type="button" onClick={() => input.current?.click()}><Upload size={26} /><strong>{loading ? "Розпакування архіву…" : "Вибрати GeoJSON, PDF або ZIP"}</strong><span>ZIP буде розпаковано, а файли пройдуть таку саму перевірку пар і кадастрових номерів</span></button>
    {files.length ? <><div className="import-summary">{archiveNames.length ? <span><FileArchive size={14} />{archiveNames.length} ZIP</span> : null}<span>{geoCount} GeoJSON</span><span>{pdfCount} PDF</span></div>{archiveNames.length ? <div className="import-archive-source"><FileArchive size={17} /><span>Розпаковано: {archiveNames.join(", ")}</span></div> : null}<div className="import-files">{files.map((file) => <div key={`${file.name}-${file.size}`}>{/\.pdf$/i.test(file.name) ? <FileText size={18} /> : <FileJson size={18} />}<span>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}</div>{skippedEntries.length ? <div className="import-package-issues">{skippedEntries.map((entry) => <p data-tone="warning" key={entry}><AlertTriangle size={16} />Пропущено непідтримуваний файл: {entry}</p>)}</div> : null}</> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <footer className="form-actions"><span /><button type="button" onClick={onCancel}>Скасувати</button><button className="command-button--primary" disabled={!files.length || !geoCount || loading} type="button" onClick={analyze}>{loading ? "Аналіз документів…" : `Перевірити пакет (${files.length})`}</button></footer>
  </div>;
}

function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} Б` : `${(bytes / 1024).toFixed(1)} КБ`; }
function formatGeometryStatus(issues: ImportReview["candidates"][number]["geometryIssues"]) { const errors = issues.filter(({ level }) => level === "error").length; const warnings = issues.length - errors; return errors ? `${errors} помилок${warnings ? `, ${warnings} попереджень` : ""}` : warnings ? `${warnings} попереджень` : "Коректна"; }
function summarizeRepairs(actions: ImportReview["candidates"][number]["repairActions"]) { const totals = Map.groupBy(actions, ({ code }) => code); return [...totals.values()].map((group) => `${group[0].code === "close-rings" ? "замкнути кілець" : "видалити дублікатів"}: ${group.reduce((sum, action) => sum + action.count, 0)}`).join(" · "); }
function formatSquareMeters(area: number) { return `${area.toLocaleString("uk-UA", { minimumFractionDigits: area < 1 ? 2 : 0, maximumFractionDigits: 2 })} м²`; }
function uniqueConflictPairs(candidates: ImportReview["candidates"], includedIds: Set<string>) {
  const pairs = new Map<string, { candidateId: string; conflict: ImportReview["candidates"][number]["conflicts"][number]; inBatch: boolean }>();
  for (const candidate of candidates) for (const conflict of candidate.conflicts) {
    const key = [candidate.plot.properties.id, conflict.plotId].sort().join(":");
    if (!pairs.has(key)) pairs.set(key, { candidateId: candidate.plot.properties.id, conflict, inBatch: includedIds.has(conflict.plotId) });
  }
  return [...pairs.values()];
}
function formatConflictGuide(pairs: ReturnType<typeof uniqueConflictPairs>) {
  const totalArea = pairs.reduce((sum, { conflict }) => sum + conflict.overlapAreaSquareMeters, 0);
  const batchCount = pairs.filter(({ inBatch }) => inBatch).length; const databaseCount = pairs.length - batchCount;
  const sources = [batchCount ? `${batchCount} між файлами пакета` : "", databaseCount ? `${databaseCount} з поточною базою` : ""].filter(Boolean).join(" · ");
  return `${pairs.length} ${pairs.length === 1 ? "пара" : "пари"} · ${formatSquareMeters(totalArea)} · ${sources}.`;
}
