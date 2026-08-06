"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, Search } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { CategoryDefinition } from "@/data/demo";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import { buildStatusReportRows, exportResultReportXlsx, exportStatusReportXlsx, type StatusReportRow } from "@/lib/status-report-export";
import type { PlotResultType } from "@/lib/plot-result-links";
import { buildResultReportGroups, resultGroupPlots, type ResultReportGroup } from "@/lib/result-report";
import type { PlotFeature } from "./types";

type MatrixMode = "progress" | "dates" | "expenses";
export type ReportView = PlotResultType | "plots";

const reportViews: ReportView[] = ["wtg", "road", "servitude", "substation", "plots"];
const viewLabelKeys = { wtg: "viewWtg", road: "viewRoad", servitude: "viewServitude", substation: "viewSubstation", plots: "viewPlots" } as const;
const titleKeys = { wtg: "wtgTitle", road: "roadTitle", servitude: "servitudeTitle", substation: "substationTitle" } as const;
const descriptionKeys = { wtg: "wtgDescription", road: "roadDescription", servitude: "servitudeDescription", substation: "substationDescription" } as const;
const countKeys = { wtg: "wtgResultCount", road: "roadResultCount", servitude: "servitudeResultCount", substation: "substationResultCount" } as const;
const numberKeys = { wtg: "wtgNumber", road: "roadNumber", servitude: "servitudeNumber", substation: "substationNumber" } as const;
const finalPlotKeys = { wtg: "finalWtgPlot", road: "finalRoadPlot", servitude: "finalServitudePlot", substation: "finalSubstationPlot" } as const;
const groupCountKeys = { wtg: "wtgCount", road: "roadCount", servitude: "servitudeCount", substation: "substationCount" } as const;
const completedByKeys = { wtg: "stageCompletedByWtg", road: "stageCompletedByRoad", servitude: "stageCompletedByServitude", substation: "stageCompletedBySubstation" } as const;

export function StatusReport({ plots, categories, statuses, view, onViewChange }: { plots: PlotFeature[]; categories: Record<string, CategoryDefinition>; statuses: PlotStatusDefinition[]; view: ReportView; onViewChange: (view: ReportView) => void }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const locale = useLocale();
  const allRows = useMemo(() => buildStatusReportRows(plots, categories), [categories, plots]);
  const resultType = view === "plots" ? null : view;
  const allResultGroups = useMemo(() => resultType ? buildResultReportGroups(plots, categories, resultType) : [], [categories, plots, resultType]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [statusId, setStatusId] = useState("all");
  const [mode, setMode] = useState<MatrixMode>("progress");
  const [mobileStatusIndex, setMobileStatusIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rows = useMemo(() => allRows.filter(({ plot }) => {
    const properties = plot.properties;
    if (categoryId !== "all" && properties.category !== categoryId) return false;
    if (!normalizedQuery) return true;
    return [properties.name, properties.cadastralNumber, properties.owner, properties.lessee]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  }), [allRows, categoryId, normalizedQuery]);
  const resultGroups = useMemo(() => allResultGroups.filter((group) => {
    const members = resultGroupPlots(group);
    if (categoryId !== "all" && !members.some(({ properties }) => properties.category === categoryId)) return false;
    if (!normalizedQuery) return true;
    return [group.number, ...members.flatMap(({ properties }) => [properties.name, properties.cadastralNumber, properties.owner, properties.lessee])].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  }), [allResultGroups, categoryId, normalizedQuery]);
  const shownStatuses = statusId === "all" ? statuses : statuses.filter(({ id }) => id === statusId);
  const activeStatusIndex = Math.min(mobileStatusIndex, Math.max(0, statuses.length - 1));
  const activeStatus = statuses[activeStatusIndex];

  const runExport = async () => {
    setExporting(true);
    try { if (resultType) await exportResultReportXlsx(resultGroups, resultType, shownStatuses, locale, categories); else await exportStatusReportXlsx(rows, shownStatuses, locale); } finally { setExporting(false); }
  };

  const itemCount = resultType ? resultGroups.length : rows.length;
  const completedCount = (resultType ? resultGroups : rows).reduce((sum, row) => sum + row.completedCount, 0);
  const totalCost = (resultType ? resultGroups : rows).reduce((sum, row) => sum + row.totalCost, 0);

  return <section className="status-report" aria-labelledby="status-report-title">
    <div className="status-report__heading"><div><span className="eyebrow">{t("progressEyebrow")}</span><h2 id="status-report-title">{resultType ? t(titleKeys[resultType]) : t("progressTitle")}</h2><p>{resultType ? t(descriptionKeys[resultType]) : t("progressDescription")}</p></div><button className="command-button command-button--primary" disabled={exporting || !itemCount} type="button" onClick={runExport}><Download size={17} />{exporting ? t("exporting") : t("downloadExcel")}</button></div>
    <div className="status-report__view"><span>{t("reportView")}</span><div className="segmented-control" role="group" aria-label={t("reportView")}>{reportViews.map((value) => <button aria-pressed={view === value} data-active={view === value} key={value} type="button" onClick={() => onViewChange(value)}>{t(viewLabelKeys[value])}</button>)}</div></div>
    <div className="status-report__filters">
      <label className="status-report__search"><span>{t("searchPlots")}</span><div><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} /></div></label>
      <label><span>{t("category")}</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="all">{t("allCategories")}</option>{Object.entries(categories).filter(([, category]) => category.visible !== false).map(([id, category]) => <option key={id} value={id}>{category.name}</option>)}</select></label>
      <label className="status-report__desktop-filter"><span>{t("stages")}</span><select value={statusId} onChange={(event) => setStatusId(event.target.value)}><option value="all">{t("allStages")}</option>{statuses.map((status, index) => <option key={status.id} value={status.id}>{index + 1}. {status.name}</option>)}</select></label>
      <fieldset className="status-report__mode"><legend>{t("cellContent")}</legend><div className="segmented-control">{(["progress", "dates", "expenses"] as const).map((value) => <button aria-pressed={mode === value} data-active={mode === value} key={value} type="button" onClick={() => setMode(value)}>{t(value)}</button>)}</div></fieldset>
    </div>
    <div className="status-report__result"><strong>{resultType ? t(countKeys[resultType], { count: itemCount }) : t("resultCount", { count: itemCount })}</strong><span>{t("completedCount", { count: completedCount })}</span><span>{format.number(totalCost, { style: "currency", currency: "UAH" })}</span></div>
    {itemCount && shownStatuses.length ? <>
      {resultType ? <DesktopResultMatrix groups={resultGroups} statuses={shownStatuses} mode={mode} type={resultType} /> : <DesktopMatrix rows={rows} statuses={shownStatuses} mode={mode} />}
      {activeStatus ? resultType ? <MobileResultStageReport groups={resultGroups} statuses={statuses} activeIndex={activeStatusIndex} mode={mode} type={resultType} onChange={setMobileStatusIndex} onModeChange={setMode} /> : <MobileStageReport rows={rows} statuses={statuses} activeIndex={activeStatusIndex} mode={mode} onChange={setMobileStatusIndex} onModeChange={setMode} /> : null}
    </> : <div className="status-report__empty">{t("noData")}</div>}
  </section>;
}

function DesktopResultMatrix({ groups, statuses, mode, type }: { groups: ResultReportGroup[]; statuses: PlotStatusDefinition[]; mode: MatrixMode; type: PlotResultType }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const locale = useLocale();
  return <div className="report-matrix-wrap"><table className="report-matrix report-matrix--result report-matrix--wtg" data-result-type={type} lang={locale}><colgroup><col className="report-matrix__wtg-number-col" /><col className="report-matrix__main-col" /><col className="report-matrix__alternatives-col" /><col className="report-matrix__final-col" /><col className="report-matrix__total-col" />{statuses.map((status) => <col className="report-matrix__stage-col" key={status.id} />)}</colgroup><thead><tr><th>{t(numberKeys[type])}</th><th>{t("mainCandidate")}</th><th>{t("alternativeCandidates")}</th><th>{t(finalPlotKeys[type])}</th><th className="report-matrix__cost">{t("totalExpenses")}</th>{statuses.map((status, index) => <th className="report-matrix__stage" key={status.id} title={status.name}><span>{index + 1}</span>{status.name}</th>)}</tr></thead><tbody>{groups.map((group) => <tr key={group.key}><th scope="row"><strong>{group.number}</strong></th><td><PlotReferences plots={group.mainCandidates} /></td><td><PlotReferences plots={group.alternativeCandidates} /></td><td><PlotReferences plots={group.finalPlots} /></td><td className="report-matrix__cost">{format.number(group.totalCost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 })}</td>{statuses.map((status) => <GroupStatusCell key={status.id} group={group} statusId={status.id} mode={mode} />)}</tr>)}</tbody><tfoot><tr><th>{t("totals")}</th><td>{t(groupCountKeys[type], { count: groups.length })}</td><td>{groups.reduce((sum, group) => sum + group.alternativeCandidates.length, 0)}</td><td>{groups.reduce((sum, group) => sum + group.finalPlots.length, 0)}</td><td className="report-matrix__cost">{format.number(groups.reduce((sum, group) => sum + group.totalCost, 0), { style: "currency", currency: "UAH", maximumFractionDigits: 2 })}</td>{statuses.map((status) => <td key={status.id}>{groups.filter((group) => group.progress.has(status.id)).length}</td>)}</tr></tfoot></table></div>;
}

function PlotReferences({ plots }: { plots: PlotFeature[] }) {
  const t = useTranslations("reports");
  if (!plots.length) return <span className="report-matrix__missing">{t("notAssigned")}</span>;
  return <div className="report-matrix__references">{plots.map(({ properties }) => <span key={properties.id}><strong>{properties.cadastralNumber}</strong><small>{properties.owner || properties.lessee}</small></span>)}</div>;
}

function GroupStatusCell({ group, statusId, mode }: { group: ResultReportGroup; statusId: string; mode: MatrixMode }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const entry = group.progress.get(statusId);
  if (!entry) return <td className="report-matrix__value" data-completed="false"><span className="sr-only">{t("notCompleted")}</span></td>;
  const fullCost = entry.cost === null ? t("noExpenses") : format.number(entry.cost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 });
  const value = mode === "progress" ? <Check size={18} aria-hidden="true" /> : mode === "dates" ? format.dateTime(new Date(entry.completedAt), { year: "2-digit", month: "2-digit", day: "2-digit" }) : entry.cost === null ? t("noExpenses") : format.number(entry.cost, { maximumFractionDigits: 2 });
  return <td className="report-matrix__value" data-completed="true" title={mode === "expenses" ? fullCost : undefined}><span className="sr-only">{t("completed")}: </span>{value}</td>;
}

function DesktopMatrix({ rows, statuses, mode }: { rows: StatusReportRow[]; statuses: PlotStatusDefinition[]; mode: MatrixMode }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const locale = useLocale();
  return <div className="report-matrix-wrap"><table className="report-matrix" lang={locale}><thead><tr><th className="report-matrix__identity">{t("plot")}</th><th className="report-matrix__category">{t("category")}</th><th className="report-matrix__cost">{t("totalExpenses")}</th>{statuses.map((status, index) => <th className="report-matrix__stage" key={status.id} title={status.name}><span>{index + 1}</span>{status.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.plot.properties.id}><th className="report-matrix__identity" scope="row"><strong>{row.plot.properties.cadastralNumber}</strong><span>{row.plot.properties.name || row.plot.properties.owner}</span></th><td className="report-matrix__category"><span className="report-matrix__category-content"><span className="category-line__swatch" style={{ background: row.category.color }} /><span>{row.category.name}</span></span></td><td className="report-matrix__cost">{format.number(row.totalCost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 })}</td>{statuses.map((status) => <StatusCell key={status.id} row={row} statusId={status.id} mode={mode} />)}</tr>)}</tbody><tfoot><tr><th className="report-matrix__identity">{t("totals")}</th><td className="report-matrix__category">{t("plotsCount", { count: rows.length })}</td><td className="report-matrix__cost">{format.number(rows.reduce((sum, row) => sum + row.totalCost, 0), { style: "currency", currency: "UAH", maximumFractionDigits: 2 })}</td>{statuses.map((status) => <td key={status.id}>{rows.filter((row) => row.progress.has(status.id)).length}</td>)}</tr></tfoot></table></div>;
}

function StatusCell({ row, statusId, mode }: { row: StatusReportRow; statusId: string; mode: MatrixMode }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const entry = row.progress.get(statusId);
  if (!entry) return <td className="report-matrix__value" data-completed="false"><span className="sr-only">{t("notCompleted")}</span></td>;
  const fullCost = entry.cost === null ? t("noExpenses") : format.number(entry.cost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 });
  const value = mode === "progress" ? <Check size={18} aria-hidden="true" /> : mode === "dates" ? format.dateTime(new Date(entry.completedAt), { year: "2-digit", month: "2-digit", day: "2-digit" }) : entry.cost === null ? t("noExpenses") : format.number(entry.cost, { maximumFractionDigits: 2 });
  return <td className="report-matrix__value" data-completed="true" title={mode === "expenses" ? fullCost : undefined}><span className="sr-only">{t("completed")}: </span>{value}</td>;
}

function MobileStageReport({ rows, statuses, activeIndex, mode, onChange, onModeChange }: { rows: StatusReportRow[]; statuses: PlotStatusDefinition[]; activeIndex: number; mode: MatrixMode; onChange: (index: number) => void; onModeChange: (mode: MatrixMode) => void }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const status = statuses[activeIndex];
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const previous = () => onChange((activeIndex - 1 + statuses.length) % statuses.length);
  const next = () => onChange((activeIndex + 1) % statuses.length);
  const finishSwipe = (x: number, y: number) => {
    if (!swipeStart.current) return;
    const deltaX = x - swipeStart.current.x;
    const deltaY = y - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) next(); else previous();
  };

  return <div
    className="mobile-stage-report"
    onPointerDown={(event) => { if (event.pointerType === "touch") swipeStart.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={(event) => { if (event.pointerType === "touch") finishSwipe(event.clientX, event.clientY); }}
    onPointerCancel={() => { swipeStart.current = null; }}
  >
    <div className="mobile-stage-report__nav"><button className="icon-button" type="button" onClick={previous} aria-label={t("previousStage")}><ArrowLeft size={19} /></button><label><span>{t("stageOf", { current: activeIndex + 1, total: statuses.length })}</span><select value={activeIndex} onChange={(event) => onChange(Number(event.target.value))}>{statuses.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.name}</option>)}</select></label><button className="icon-button" type="button" onClick={next} aria-label={t("nextStage")}><ArrowRight size={19} /></button></div>
    <div className="mobile-stage-report__summary" aria-live="polite"><strong>{status.name}</strong><span>{t("stageCompletedBy", { completed: rows.filter((row) => row.progress.has(status.id)).length, total: rows.length })}</span></div>
    <fieldset className="mobile-stage-report__mode"><legend>{t("cellContent")}</legend><div className="segmented-control">{(["progress", "dates", "expenses"] as const).map((value) => <button aria-pressed={mode === value} data-active={mode === value} key={value} type="button" onClick={() => onModeChange(value)}>{t(value)}</button>)}</div></fieldset>
    <div className="mobile-stage-report__list-header"><span>{t("plot")}</span><strong>{t("stageNumber", { number: activeIndex + 1 })}</strong></div>
    <div className="mobile-stage-report__list">{rows.map((row) => {
      const entry = row.progress.get(status.id);
      return <article data-completed={Boolean(entry)} key={row.plot.properties.id}>
        <div className="mobile-stage-report__plot"><span className="category-line__swatch" style={{ background: row.category.color }} /><span><strong>{row.plot.properties.cadastralNumber}</strong><small>{row.plot.properties.name || row.category.name}</small></span></div>
        <div className="mobile-stage-report__stage-value" data-completed={Boolean(entry)}>
          {mode === "progress" ? <><span className="mobile-stage-report__stage-mark" aria-hidden="true">{entry ? <Check size={20} /> : "—"}</span><small>{entry ? t("completed") : t("notCompleted")}</small></> : mode === "dates" ? <span className="mobile-stage-report__stage-detail">{entry ? format.dateTime(new Date(entry.completedAt), { dateStyle: "short", timeStyle: "short" }) : "—"}</span> : <span className="mobile-stage-report__stage-detail">{entry ? entry.cost === null ? t("noExpenses") : format.number(entry.cost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 }) : "—"}</span>}
          <span className="sr-only">{entry ? t("completed") : t("notCompleted")}</span>
        </div>
      </article>;
    })}</div>
  </div>;
}

function MobileResultStageReport({ groups, statuses, activeIndex, mode, type, onChange, onModeChange }: { groups: ResultReportGroup[]; statuses: PlotStatusDefinition[]; activeIndex: number; mode: MatrixMode; type: PlotResultType; onChange: (index: number) => void; onModeChange: (mode: MatrixMode) => void }) {
  const t = useTranslations("reports");
  const format = useFormatter();
  const status = statuses[activeIndex];
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const previous = () => onChange((activeIndex - 1 + statuses.length) % statuses.length);
  const next = () => onChange((activeIndex + 1) % statuses.length);
  const finishSwipe = (x: number, y: number) => {
    if (!swipeStart.current) return;
    const deltaX = x - swipeStart.current.x; const deltaY = y - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) next(); else previous();
  };

  return <div className="mobile-stage-report" onPointerDown={(event) => { if (event.pointerType === "touch") swipeStart.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => { if (event.pointerType === "touch") finishSwipe(event.clientX, event.clientY); }} onPointerCancel={() => { swipeStart.current = null; }}>
    <div className="mobile-stage-report__nav"><button className="icon-button" type="button" onClick={previous} aria-label={t("previousStage")}><ArrowLeft size={19} /></button><label><span>{t("stageOf", { current: activeIndex + 1, total: statuses.length })}</span><select value={activeIndex} onChange={(event) => onChange(Number(event.target.value))}>{statuses.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.name}</option>)}</select></label><button className="icon-button" type="button" onClick={next} aria-label={t("nextStage")}><ArrowRight size={19} /></button></div>
    <div className="mobile-stage-report__summary" aria-live="polite"><strong>{status.name}</strong><span>{t(completedByKeys[type], { completed: groups.filter((group) => group.progress.has(status.id)).length, total: groups.length })}</span></div>
    <fieldset className="mobile-stage-report__mode"><legend>{t("cellContent")}</legend><div className="segmented-control">{(["progress", "dates", "expenses"] as const).map((value) => <button aria-pressed={mode === value} data-active={mode === value} key={value} type="button" onClick={() => onModeChange(value)}>{t(value)}</button>)}</div></fieldset>
    <div className="mobile-stage-report__list-header"><span>{t(numberKeys[type])}</span><strong>{t("stageNumber", { number: activeIndex + 1 })}</strong></div>
    <div className="mobile-stage-report__list">{groups.map((group) => {
      const entry = group.progress.get(status.id);
      return <article data-completed={Boolean(entry)} key={group.key}><div className="mobile-stage-report__plot"><span className="result-number-mark wtg-number-mark">{group.number}</span><span><strong>{group.primary?.properties.cadastralNumber ?? t("mainCandidateMissing")}</strong><small>{group.alternativeCandidates.length ? t("alternativesShort", { count: group.alternativeCandidates.length }) : t("noAlternatives")}{group.finalPlots.length ? ` · ${t("finalPlotReady")}` : ""}</small></span></div><div className="mobile-stage-report__stage-value" data-completed={Boolean(entry)}>{mode === "progress" ? <><span className="mobile-stage-report__stage-mark" aria-hidden="true">{entry ? <Check size={20} /> : "—"}</span><small>{entry ? t("completed") : t("notCompleted")}</small></> : mode === "dates" ? <span className="mobile-stage-report__stage-detail">{entry ? format.dateTime(new Date(entry.completedAt), { dateStyle: "short", timeStyle: "short" }) : "—"}</span> : <span className="mobile-stage-report__stage-detail">{entry ? entry.cost === null ? t("noExpenses") : format.number(entry.cost, { style: "currency", currency: "UAH", maximumFractionDigits: 2 }) : "—"}</span>}<span className="sr-only">{entry ? t("completed") : t("notCompleted")}</span></div></article>;
    })}</div>
  </div>;
}
