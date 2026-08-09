"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, FileInput, History, Pencil, Plus, RefreshCw, RotateCcw, Search, Settings2, Trash2 } from "lucide-react";
import { demoPlots } from "@/data/demo";
import type { AuditAction, AuditEntry, VersionComparison } from "@/lib/audit";
import type { BaseMapId } from "./types";
import type { DataWorkspace } from "@/lib/data-workspace";
import { VersionCompareDialog } from "./VersionCompareDialog";

type Scope = "all" | "plots" | "import";

const demoEntries: AuditEntry[] = [
  { id: "audit-demo-1", actorUserId: "demo-admin", actorName: "Демо Адміністратор", actorEmail: "admin@example.com", action: "import.completed", entityType: "import", entityId: "batch-demo", cadastralNumber: null, summary: "Імпорт завершено: додано 3, оновлено 0.", details: { added: 3, updated: 0, files: ["ділянки.geojson", "кадастрові-документи.pdf"] }, createdAt: "2026-07-21T08:45:00.000Z" },
  { id: "audit-demo-2", actorUserId: "demo-admin", actorName: "Демо Адміністратор", actorEmail: "admin@example.com", action: "plot.updated", entityType: "plot", entityId: "demo-0018", cadastralNumber: "6820982100:04:051:0018", summary: "Оновлено ділянку 6820982100:04:051:0018.", details: { changes: ["Контур", "Площа"], source: "manual" }, createdAt: "2026-07-21T08:31:00.000Z", canRestore: true },
  { id: "audit-demo-3", actorUserId: "demo-user", actorName: "Олена Коваль", actorEmail: "olena@example.com", action: "plot.created", entityType: "plot", entityId: "demo-0020", cadastralNumber: "6820982100:04:051:0020", summary: "Створено ділянку 6820982100:04:051:0020 через імпорт.", details: { changes: ["Створено ділянку"], source: "import", batchId: "batch-demo" }, createdAt: "2026-07-20T14:12:00.000Z" },
  { id: "audit-demo-4", actorUserId: "demo-admin", actorName: "Демо Адміністратор", actorEmail: "admin@example.com", action: "plot.deleted", entityType: "plot", entityId: "archived-plot", cadastralNumber: "6820982100:04:051:0007", summary: "Видалено ділянку 6820982100:04:051:0007.", details: { changes: ["Видалено ділянку"], source: "manual" }, createdAt: "2026-07-18T11:05:00.000Z", canRestore: true },
];

export function AuditPanel({ preview, baseMap, canRestore, onRestore, workspace }: { preview: boolean; baseMap: BaseMapId; canRestore: boolean; onRestore: (id: string) => Promise<void>; workspace: DataWorkspace }) {
  const t = useTranslations("auditUi");
  const locale = useLocale();
  const [scope, setScope] = useState<Scope>("all"); const [query, setQuery] = useState(""); const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1); const [items, setItems] = useState<AuditEntry[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [comparisonId, setComparisonId] = useState<string | null>(null); const [comparison, setComparison] = useState<VersionComparison | null>(null); const [compareError, setCompareError] = useState(""); const [restoring, setRestoring] = useState(false); const [refresh, setRefresh] = useState(0); const [operationMessage, setOperationMessage] = useState("");
  const limit = 20;

  useEffect(() => {
    const controller = new AbortController();
    if (preview) {
      const normalized = deferredQuery.trim().toLocaleLowerCase(locale);
      const filtered = demoEntries.filter((entry) => (scope === "all" || (scope === "import" ? entry.action === "import.completed" : entry.action.startsWith("plot."))) && (!normalized || [entry.summary, entry.cadastralNumber, entry.actorName, entry.actorEmail].join(" ").toLocaleLowerCase(locale).includes(normalized)));
      queueMicrotask(() => { if (!controller.signal.aborted) { setItems(filtered.slice((page - 1) * limit, page * limit)); setTotal(filtered.length); setLoading(false); } }); return () => controller.abort();
    }
    const params = new URLSearchParams({ page: String(page), limit: String(limit), scope }); if (deferredQuery.trim()) params.set("q", deferredQuery.trim());
    fetch(`/api/audit?${params}`, { signal: controller.signal }).then(async (response) => { const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? t("loadFailed")); setItems(body.items); setTotal(body.total); }).catch((reason) => { if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : t("loadFailed")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [deferredQuery, locale, page, preview, refresh, scope, t]);

  const openComparison = async (entry: AuditEntry) => { setComparisonId(entry.id); setCompareError(""); setOperationMessage(""); try { if (preview) { setComparison(demoComparison(entry)); return; } const response = await fetch(`/api/audit/${encodeURIComponent(entry.id)}/version`); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? t("compareFailed")); setComparison(body as VersionComparison); } catch (reason) { setOperationMessage(reason instanceof Error ? reason.message : t("compareFailed")); setComparisonId(null); } };
  const restore = async () => { if (!comparison) return; setRestoring(true); setCompareError(""); try { await onRestore(comparison.auditId); setOperationMessage(t("restored")); setComparison(null); setComparisonId(null); setRefresh((value) => value + 1); } catch (reason) { setCompareError(reason instanceof Error ? reason.message : t("restoreFailed")); } finally { setRestoring(false); } };
  const retry = () => { setError(""); setLoading(true); setRefresh((value) => value + 1); };

  const pages = Math.max(1, Math.ceil(total / limit));
  return <section className="workspace-page audit-page"><header className="workspace-page__header"><div><span className="eyebrow">{workspace === "sandbox" ? t("testHistory") : t("productionHistory")}</span><h1>{t("title")}</h1></div><span className="audit-total">{t("records", { count: total })}</span></header>
    <div className="audit-toolbar"><label className="search-field"><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setLoading(true); setError(""); }} placeholder={t("search")} /></label><div className="segmented-control" role="group" aria-label={t("eventType")}>{(["all", "plots", "import"] as const).map((id) => <button type="button" data-active={scope === id} onClick={() => { setScope(id); setPage(1); setLoading(true); setError(""); }} key={id}>{t(id === "import" ? "imports" : id)}</button>)}</div></div>
    {operationMessage ? <p className="form-message" role="status">{operationMessage}</p> : null}
    {loading ? <div className="audit-state"><History size={24} /><p>{t("loading")}</p></div> : error ? <div className="audit-state" data-tone="error"><History size={24} /><p>{error}</p><button className="command-button" type="button" onClick={retry}><RefreshCw size={16} />{t("retry")}</button></div> : !items.length ? <div className="audit-state"><History size={24} /><p>{t("empty")}</p></div> : <div className="audit-list">{items.map((entry) => <AuditRow entry={entry} canRestore={canRestore} loading={comparisonId === entry.id && !comparison} onCompare={() => openComparison(entry)} key={entry.id} />)}</div>}
    {total > limit ? <footer className="audit-pagination"><button className="icon-button" type="button" aria-label={t("previous")} disabled={page <= 1} onClick={() => { setPage((value) => value - 1); setLoading(true); }}><ChevronLeft size={18} /></button><span>{t("page", { page, pages })}</span><button className="icon-button" type="button" aria-label={t("next")} disabled={page >= pages} onClick={() => { setPage((value) => value + 1); setLoading(true); }}><ChevronRight size={18} /></button></footer> : null}
    {comparison ? <VersionCompareDialog comparison={comparison} baseMap={baseMap} busy={restoring} error={compareError} onClose={() => { if (!restoring) { setComparison(null); setComparisonId(null); } }} onConfirm={restore} /> : null}
  </section>;
}

function AuditRow({ entry, canRestore, loading, onCompare }: { entry: AuditEntry; canRestore: boolean; loading: boolean; onCompare: () => void }) {
  const t = useTranslations("auditUi");
  const format = useFormatter();
  const changes = Array.isArray(entry.details.changes) ? entry.details.changes.filter((value): value is string => typeof value === "string") : [];
  const files = Array.isArray(entry.details.files) ? entry.details.files.filter((value): value is string => typeof value === "string") : [];
  return <details className="audit-row"><summary><span className="audit-row__icon" data-action={entry.action}>{actionIcon(entry.action)}</span><span className="audit-row__main"><strong>{entry.summary}</strong><small>{entry.actorName} · {entry.actorEmail}</small></span><time dateTime={String(entry.createdAt)}>{format.dateTime(new Date(entry.createdAt), { dateStyle: "medium", timeStyle: "short" })}</time></summary><div className="audit-row__details"><span><b>{t("event")}</b>{t(actionLabelKey(entry.action))}</span>{entry.cadastralNumber ? <span><b>{t("cadastral")}</b>{entry.cadastralNumber}</span> : null}{changes.length ? <span><b>{t("changedData")}</b>{changes.join(", ")}</span> : null}{files.length ? <span><b>{t("packageFiles")}</b>{files.join(", ")}</span> : null}{entry.canRestore && canRestore ? <button className="command-button audit-restore" type="button" disabled={loading} onClick={onCompare}><RotateCcw size={16} />{loading ? t("preparing") : t("compareRestore")}</button> : null}</div></details>;
}

function actionIcon(action: AuditAction) { if (action === "plot.created") return <Plus size={18} />; if (action === "plot.updated") return <Pencil size={17} />; if (action === "plot.deleted") return <Trash2 size={17} />; if (action === "plot.restored") return <RotateCcw size={17} />; if (action === "plot-statuses.updated") return <Settings2 size={17} />; return <FileInput size={18} />; }
function actionLabelKey(action: AuditAction) { return ({ "plot.created": "created", "plot.updated": "updated", "plot.deleted": "deleted", "plot.restored": "restoredAction", "import.completed": "imported", "plot-statuses.updated": "statuses", "result-status-progress.updated": "resultStages", "workspace.snapshot.created": "snapshot" } as const)[action]; }

function demoComparison(entry: AuditEntry): VersionComparison {
  const source = demoPlots.features[0];
  if (entry.action === "plot.deleted") return { auditId: entry.id, action: entry.action, current: null, target: { ...source, properties: { ...source.properties, id: entry.entityId ?? "restored-demo", cadastralNumber: entry.cadastralNumber ?? source.properties.cadastralNumber } }, validationIssues: [], conflicts: [], blockingMessages: [] };
  const coordinates = source.geometry.coordinates.map((ring) => ring.map((point) => [...point])); coordinates[0][0] = [coordinates[0][0][0] - 0.00018, coordinates[0][0][1] + 0.00008]; coordinates[0][coordinates[0].length - 1] = [...coordinates[0][0]];
  return { auditId: entry.id, action: entry.action, current: source, target: { ...source, geometry: { type: "Polygon", coordinates }, properties: { ...source.properties, areaHa: Math.max(0, source.properties.areaHa - 0.0142) } }, validationIssues: [], conflicts: [], blockingMessages: [] };
}
