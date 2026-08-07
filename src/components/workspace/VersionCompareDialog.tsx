"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { MapCanvas } from "@/components/map/MapCanvas";
import { WorkspaceModal } from "@/components/workspace/WorkspaceModal";
import { calculatePolygonAreaHa } from "@/lib/geometry";
import { areaUnit, normalizeDocumentDate } from "@/lib/localized-values";
import { totalPlotStatusCost } from "@/lib/plot-status-progress";
import { parsePlotResultLinks, type PlotResultType } from "@/lib/plot-result-links";
import type { VersionComparison } from "@/lib/audit";
import type { BaseMapId, PlotFeature } from "./types";

export function VersionCompareDialog({ comparison, baseMap, busy, error, onClose, onConfirm }: { comparison: VersionComparison; baseMap: BaseMapId; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const t = useTranslations("versions");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const mapPlots = comparison.current ? [comparisonFeature(comparison.target, "version-target", "version-target"), comparisonFeature(comparison.current, "version-current", "version-current")] : [comparisonFeature(comparison.target, "version-target", "version-target")];
  const labels: VersionLabels = { cadastral: t("cadastral"), name: t("name"), category: t("category"), area: t("area"), outlineArea: t("outlineArea"), stagesCosts: t("stagesCosts"), resultLinks: t("resultLinks"), specialParameters: t("specialParameters"), resultTypes: { wtg: t("resultWtg"), road: t("resultRoad"), servitude: t("resultServitude"), substation: t("resultSubstation") }, owner: t("owner"), lessee: t("lessee"), documentActualAt: t("documentActualAt"), outline: t("outline"), document: t("document"), missing: t("missing"), notDefined: common("notDefined"), points: (count) => t("points", { count }), stageSummary: (count, cost) => t("stageSummary", { count, cost }) };
  const differences = compareFields(comparison.current, comparison.target, labels, (value, options) => format.number(value, options), areaUnit(locale)); const blocked = comparison.blockingMessages.length > 0;
  const overlapFeatures = comparison.conflicts.map(({ geometry }) => ({ type: "Feature" as const, properties: {}, geometry }));
  return <WorkspaceModal title={t("title")} description={comparison.target.properties.cadastralNumber} onClose={onClose} wide><div className="version-compare">
    <div className="version-compare__status" data-tone={blocked ? "error" : comparison.conflicts.length ? "warning" : "ok"}>{blocked || comparison.conflicts.length ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}<div><strong>{blocked ? t("blocked") : comparison.current ? t("ready") : t("restoreDeleted")}</strong><span>{blocked ? comparison.blockingMessages.join(" ") : comparison.conflicts.length ? t("overlaps", { count: comparison.conflicts.length }) : t("checksPassed")}</span></div></div>
    <div className="version-compare__layout"><section className="version-compare__map"><MapCanvas plots={mapPlots} categories={{ default: { name: t("current"), description: "", color: "#657169", visible: true }, "version-current": { name: t("current"), description: "", color: "#657169", visible: true }, "version-target": { name: t("saved"), description: "", color: "#16845a", visible: true } }} baseMap={baseMap} selectedId="version-target" conflictIds={comparison.conflicts.length ? ["version-target"] : []} overlapFeatures={overlapFeatures} onSelect={() => undefined} /><div className="version-compare__legend"><span><i data-tone="current" />{t("current")}</span><span><i data-tone="target" />{t("saved")}</span></div></section><section className="version-compare__diff"><header><strong>{t("changes")}</strong><span>{t("fields", { count: differences.length })}</span></header>{differences.length ? <div className="version-diff-list">{differences.map((item) => <div key={item.label}><strong>{item.label}</strong><span>{item.current}</span><ArrowRight size={14} /><span>{item.target}</span></div>)}</div> : <p className="version-compare__empty">{t("same")}</p>}</section></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}<footer className="form-actions"><span /><button type="button" onClick={onClose}>{common("cancel")}</button><button className="command-button--primary" type="button" disabled={blocked || busy || !differences.length} onClick={onConfirm}><RotateCcw size={17} />{busy ? t("restoring") : t("restore")}</button></footer>
  </div></WorkspaceModal>;
}

function comparisonFeature(plot: PlotFeature, id: string, category: string): PlotFeature { return { ...plot, properties: { ...plot.properties, id, category } }; }

type VersionLabels = { cadastral: string; name: string; category: string; area: string; outlineArea: string; stagesCosts: string; resultLinks: string; specialParameters: string; resultTypes: Record<PlotResultType, string>; owner: string; lessee: string; documentActualAt: string; outline: string; document: string; missing: string; notDefined: string; points: (count: number) => string; stageSummary: (count: number, cost: string) => string };

type NumberOptions = { minimumFractionDigits?: number; maximumFractionDigits?: number };

function compareFields(current: PlotFeature | null, target: PlotFeature, labels: VersionLabels, formatNumber: (value: number, options?: NumberOptions) => string, unit: string) {
  const fields = [
    [labels.cadastral, current?.properties.cadastralNumber, target.properties.cadastralNumber],
    [labels.name, current?.properties.name, target.properties.name],
    [labels.category, current?.properties.category, target.properties.category],
    [labels.area, current ? `${formatNumber(current.properties.areaHa)} ${unit}` : null, `${formatNumber(target.properties.areaHa)} ${unit}`],
    [labels.outlineArea, current ? `${formatNumber(calculatePolygonAreaHa(current.geometry))} ${unit}` : null, `${formatNumber(calculatePolygonAreaHa(target.geometry))} ${unit}`],
    [labels.stagesCosts, current ? stageSummary(current, labels, formatNumber) : null, stageSummary(target, labels, formatNumber)],
    [labels.resultLinks, current ? resultLinksSummary(current, labels) : null, resultLinksSummary(target, labels)],
    [labels.specialParameters, current ? specialParametersSummary(current) : null, specialParametersSummary(target)],
    [labels.owner, current?.properties.owner, target.properties.owner],
    [labels.lessee, current?.properties.lessee, target.properties.lessee],
    [labels.documentActualAt, normalizeDocumentDate(current?.properties.documentActualAt), normalizeDocumentDate(target.properties.documentActualAt)],
    [labels.outline, current ? labels.points(coordinateCount(current)) : null, labels.points(coordinateCount(target))],
    [labels.document, current?.properties.documentName, target.properties.documentName],
  ] as const;
  return fields.flatMap(([label, left, right]) => normalize(left) === normalize(right) && (label !== labels.outline || (current && JSON.stringify(current.geometry) === JSON.stringify(target.geometry))) ? [] : [{ label, current: current ? display(left, labels.notDefined) : labels.missing, target: display(right, labels.notDefined) }]);
}

function coordinateCount(plot: PlotFeature) { return plot.geometry.coordinates.reduce((count, ring) => count + ring.length, 0); }
function stageSummary(plot: PlotFeature, labels: VersionLabels, formatNumber: (value: number, options?: NumberOptions) => string) { const entries = plot.properties.statusProgress ?? []; return labels.stageSummary(entries.length, formatNumber(totalPlotStatusCost(entries), { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
function resultLinksSummary(plot: PlotFeature, labels: VersionLabels) { return parsePlotResultLinks(plot.properties.resultLinks).map(({ type, number }) => `${labels.resultTypes[type]}: ${number}`).join(", "); }
function specialParametersSummary(plot: PlotFeature) { const p = plot.properties; return [p.roadOwnershipType, p.servitudeValidFrom, p.servitudeValidUntil, p.servitudePaymentAmount, p.servitudePaymentPeriod, p.substationType, p.substationCapacityMw].filter((value) => value !== null && value !== undefined && value !== "").join(" · "); }
function normalize(value: unknown) { return value === null || value === undefined ? "" : String(value); }
function display(value: unknown, fallback: string) { const text = normalize(value).trim(); return text || fallback; }
