"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Download, History, RefreshCw } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import { defaultCategories, demoPlots } from "@/data/demo";
import { defaultPlotStatuses } from "@/data/plot-statuses";
import type { DataWorkspace } from "@/lib/data-workspace";
import { buildSnapshotKpis, type SnapshotKpis } from "@/lib/snapshot-report";
import { exportSnapshotReportPdf } from "@/lib/snapshot-report-export";
import { buildWorkspaceSnapshotPayload, type WorkspaceSnapshotPayload } from "@/lib/workspace-snapshot-format";
import type { BaseMapId } from "./types";

type SnapshotMetadata = { id: string; workspace: DataWorkspace; capturedAt: string; plotCount: number; categoryCount: number; statusCount: number };
type SnapshotDetail = SnapshotMetadata & { payload: WorkspaceSnapshotPayload; previous: SnapshotMetadata | null; kpis: SnapshotKpis };

export function SnapshotHistoryPanel({ preview, baseMap, workspace }: { preview: boolean; baseMap: BaseMapId; workspace: DataWorkspace }) {
  const t = useTranslations("snapshotHistory"); const locale = useLocale(); const format = useFormatter();
  const previewData = useMemo(() => buildPreviewSnapshots(workspace), [workspace]);
  const [items, setItems] = useState<SnapshotMetadata[]>(preview ? previewData.items : []);
  const [selectedId, setSelectedId] = useState(preview ? previewData.items[0]?.id ?? "" : "");
  const [detail, setDetail] = useState<SnapshotDetail | null>(preview ? previewData.detail : null);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!preview); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch("/api/snapshots", { signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? t("loadFailed"));
      const nextItems = body.items as SnapshotMetadata[]; setItems(nextItems); setSelectedId((current) => current && nextItems.some(({ id }) => id === current) ? current : nextItems[0]?.id ?? ""); if (!nextItems.length) setLoading(false);
    }).catch((reason) => { if (reason.name !== "AbortError") { setError(reason instanceof Error ? reason.message : t("loadFailed")); setLoading(false); } });
    return () => controller.abort();
  }, [preview, refresh, t]);

  useEffect(() => {
    if (preview || !selectedId) return;
    const controller = new AbortController();
    fetch(`/api/snapshots/${encodeURIComponent(selectedId)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? t("detailFailed"));
      setDetail(body as SnapshotDetail); setSelectedPlotId(null);
    }).catch((reason) => { if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : t("detailFailed")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preview, selectedId, t]);

  const categoryTotals = detail ? Object.entries(detail.payload.categories).map(([id, category]) => ({ id, category, count: detail.payload.plots.filter(({ properties }) => properties.category === id).length })).filter(({ count }) => count > 0) : [];
  return <section className="workspace-page snapshot-page">
    <header className="workspace-page__header"><div><span className="eyebrow">{workspace === "sandbox" ? t("testHistory") : t("productionHistory")}</span><h1>{t("title")}</h1></div>{detail ? <button className="command-button command-button--primary" type="button" onClick={() => void exportSnapshotReportPdf(detail, locale)}><Download size={17} />{t("downloadPdf")}</button> : null}</header>
    {items.length ? <div className="snapshot-toolbar"><label><span>{t("snapshotDate")}</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setDetail(null); setLoading(true); setError(""); }}>{items.map((item) => <option key={item.id} value={item.id}>{format.dateTime(new Date(item.capturedAt), { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><small>{t("retention")}</small></div> : null}
    {loading && !detail ? <SnapshotState text={t("loading")} /> : error ? <div className="audit-state" data-tone="error"><History size={24} /><p>{error}</p><button className="command-button" type="button" onClick={() => { setLoading(true); setError(""); setRefresh((value) => value + 1); }}><RefreshCw size={16} />{t("retry")}</button></div> : !detail ? <SnapshotState text={t("empty")} /> : <>
      <div className="snapshot-metrics"><article><span>{t("plots")}</span><strong>{metricText(detail.kpis.plots)}</strong></article><article><span>{t("categories")}</span><strong>{detail.categoryCount}</strong></article><article><span>{t("stages")}</span><strong>{detail.statusCount}</strong></article><article><span>{t("previous")}</span><strong>{detail.previous ? format.dateTime(new Date(detail.previous.capturedAt), { dateStyle: "medium" }) : t("firstSnapshot")}</strong></article></div>
      <div className="snapshot-layout"><div className="snapshot-map"><MapCanvas plots={detail.payload.plots} categories={detail.payload.categories} baseMap={baseMap} selectedId={selectedPlotId} onSelect={setSelectedPlotId} /></div><aside className="snapshot-categories"><h2>{t("categoryState")}</h2>{categoryTotals.map(({ id, category, count }) => <div key={id}><span className="category-swatch" style={{ background: category.color }} /><span>{category.name}</span><strong>{count}</strong></div>)}</aside></div>
      <div className="snapshot-kpis"><h2>{t("stageTotals")}</h2><div className="snapshot-kpi-table"><div className="snapshot-kpi-row snapshot-kpi-row--head"><span>#</span><span>{t("stage")}</span><span>{t("current")}</span><span>{t("change")}</span></div>{detail.kpis.statuses.map((item, index) => <div className="snapshot-kpi-row" key={item.id}><span>{index + 1}</span><strong>{item.name}</strong><span>{item.current}</span><Delta value={item.delta} first={t("firstSnapshot")} /></div>)}</div></div>
    </>}
  </section>;
}

function Delta({ value, first }: { value: number | null; first: string }) { return <span className="snapshot-delta" data-tone={value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative"}>{value === null ? first : `${value > 0 ? "+" : ""}${value}`}</span>; }
function metricText(metric: SnapshotKpis["plots"]) { return `${metric.current}${metric.delta === null ? "" : ` (${metric.delta > 0 ? "+" : ""}${metric.delta})`}`; }
function SnapshotState({ text }: { text: string }) { return <div className="audit-state"><History size={24} /><p>{text}</p></div>; }
function buildPreviewSnapshots(workspace: DataWorkspace) {
  const now = new Date("2026-08-01T20:00:00.000Z");
  const previousPayload = buildWorkspaceSnapshotPayload({ workspace, capturedAt: "2026-07-25T20:00:00.000Z", categories: defaultCategories, plotStatuses: defaultPlotStatuses, plots: demoPlots.features.slice(0, 1) });
  const payload = buildWorkspaceSnapshotPayload({ workspace, capturedAt: now, categories: defaultCategories, plotStatuses: defaultPlotStatuses, plots: demoPlots.features });
  const metadata: SnapshotMetadata = { id: "snapshot-demo-current", workspace, capturedAt: now.toISOString(), plotCount: payload.plots.length, categoryCount: Object.keys(payload.categories).length, statusCount: payload.plotStatuses.length };
  const previous: SnapshotMetadata = { id: "snapshot-demo-previous", workspace, capturedAt: previousPayload.capturedAt, plotCount: previousPayload.plots.length, categoryCount: Object.keys(previousPayload.categories).length, statusCount: previousPayload.plotStatuses.length };
  return { items: [metadata, previous], detail: { ...metadata, payload, previous, kpis: buildSnapshotKpis(payload, previousPayload) } };
}
