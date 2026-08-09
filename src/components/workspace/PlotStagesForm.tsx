"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Coins, Save } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { statusesForScope, type PlotStatusDefinition, type PlotStatusScope } from "@/data/plot-statuses";
import { totalPlotStatusCost, type PlotStatusProgress } from "@/lib/plot-status-progress";
import { parsePlotResultLinks, type PlotResultType } from "@/lib/plot-result-links";
import { progressForResult, type ResultStatusProgress } from "@/lib/result-status-progress";
import type { PlotFeature } from "./types";

type DraftEntry = { completedAt: string; cost: string };
type StageContext = { key: string; scope: PlotStatusScope; resultType?: PlotResultType; resultNumber?: string };

export function PlotStagesForm({ plot, statuses, resultProgress, editable, canManageExpenses, onSavePlot, onSaveResult, onClose }: { plot: PlotFeature; statuses: PlotStatusDefinition[]; resultProgress: ResultStatusProgress[]; editable: boolean; canManageExpenses: boolean; onSavePlot?: (plot: PlotFeature) => Promise<void>; onSaveResult?: (resultType: PlotResultType, resultNumber: string, progress: ResultStatusProgress[]) => Promise<void>; onClose: () => void }) {
  const t = useTranslations("stages");
  const workspaceT = useTranslations("workspace");
  const common = useTranslations("common");
  const format = useFormatter();
  const contexts = useMemo<StageContext[]>(() => [
    ...parsePlotResultLinks(plot.properties.resultLinks).map((link) => ({ key: `${link.type}:${link.number.toLocaleLowerCase("uk-UA")}`, scope: link.type, resultType: link.type, resultNumber: link.number })),
    { key: "plots", scope: "plots" },
  ], [plot.properties.resultLinks]);
  const [contextKey, setContextKey] = useState(contexts[0]?.key ?? "plots");
  const context = contexts.find(({ key }) => key === contextKey) ?? contexts[0];
  const scopedStatuses = useMemo(() => statusesForScope(statuses, context.scope), [context.scope, statuses]);
  const [draft, setDraft] = useState<Record<string, DraftEntry>>(() => draftForContext(context, plot, resultProgress));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errors = { dateRequired: t("dateRequired"), invalidExpense: t("invalidExpense") };
  const draftProgress = toProgress(draft, scopedStatuses, false, errors);

  const toggle = (statusId: string, checked: boolean) => {
    if (!editable) return;
    setDraft((current) => {
      if (checked) return { ...current, [statusId]: current[statusId] ?? { completedAt: toLocalDateTime(new Date().toISOString()), cost: "" } };
      const next = { ...current };
      delete next[statusId];
      return next;
    });
  };

  const update = (statusId: string, changes: Partial<DraftEntry>) => setDraft((current) => ({ ...current, [statusId]: { ...current[statusId], ...changes } }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editable) return;
    setError("");
    try {
      const progress = toProgress(draft, scopedStatuses, true, errors);
      setSaving(true);
      if (context.resultType && context.resultNumber && onSaveResult) {
        await onSaveResult(context.resultType, context.resultNumber, progress.map((entry) => ({ ...entry, resultType: context.resultType!, resultNumber: context.resultNumber! })));
      } else if (onSavePlot) {
        const currentStatus = [...scopedStatuses].reverse().find(({ id }) => progress.some((entry) => entry.statusId === id))?.name ?? "";
        await onSavePlot({ ...plot, properties: { ...plot.properties, status: currentStatus, statusProgress: progress } });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("saveFailed"));
      setSaving(false);
    }
  };

  const contextLabel = (item: StageContext) => item.resultType && item.resultNumber ? `${workspaceT(resultLabelKey(item.resultType))} № ${item.resultNumber}` : t("plotProcess");

  return <form className="plot-stages" onSubmit={submit}>
    {contexts.length > 1 ? <label className="plot-stages__context"><span>{t("process")}</span><select value={context.key} onChange={(event) => { const next = contexts.find(({ key }) => key === event.target.value) ?? contexts[0]; setContextKey(next.key); setDraft(draftForContext(next, plot, resultProgress)); setError(""); }}>{contexts.map((item) => <option key={item.key} value={item.key}>{contextLabel(item)}</option>)}</select></label> : null}
    <div className="plot-stages__summary"><span>{t("summary", { done: Object.keys(draft).length, total: scopedStatuses.length })}</span>{canManageExpenses ? <span><Coins size={16} />{format.number(totalPlotStatusCost(draftProgress), { style: "currency", currency: "UAH" })}</span> : null}</div>
    <div className="plot-stages__list">
      {scopedStatuses.map((status, index) => {
        const entry = draft[status.id];
        return <section className="plot-stage-row" data-completed={Boolean(entry)} key={status.id}>
          <label className="plot-stage-row__check"><input type="checkbox" checked={Boolean(entry)} disabled={!editable} onChange={(event) => toggle(status.id, event.target.checked)} /><span className="plot-stage-row__number">{index + 1}</span><strong>{status.name}</strong></label>
          {entry ? editable ? <div className="plot-stage-row__fields">
            <label><span><CalendarClock size={15} />{t("dateTime")}</span><input aria-label={t("dateLabel", { name: status.name })} type="datetime-local" value={entry.completedAt} required onChange={(event) => update(status.id, { completedAt: event.target.value })} /></label>
            {canManageExpenses ? <label><span><Coins size={15} />{t("expensesCurrency")}</span><input aria-label={t("expenseLabel", { name: status.name })} type="number" min="0" max="999999999999.99" step="0.01" inputMode="decimal" placeholder={common("notSpecified")} value={entry.cost} onChange={(event) => update(status.id, { cost: event.target.value })} /></label> : null}
          </div> : <dl className="plot-stage-row__readout"><div><dt>{t("dateTime")}</dt><dd>{format.dateTime(new Date(entry.completedAt), { dateStyle: "medium", timeStyle: "short" })}</dd></div>{canManageExpenses ? <div><dt>{t("expenses")}</dt><dd>{entry.cost !== "" ? format.number(Number(entry.cost), { style: "currency", currency: "UAH" }) : common("notSpecified")}</dd></div> : null}</dl> : null}
        </section>;
      })}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <footer className="form-actions"><span /><button type="button" onClick={onClose}>{editable ? common("cancel") : common("close")}</button>{editable ? <button className="command-button--primary" type="submit" disabled={saving}><Save size={17} />{saving ? common("saving") : t("save")}</button> : null}</footer>
  </form>;
}

function resultLabelKey(type: PlotResultType) {
  return ({ wtg: "resultWtg", road: "resultRoad", servitude: "resultServitude", substation: "resultSubstation" } as const)[type];
}

function draftForContext(context: StageContext, plot: PlotFeature, resultProgress: ResultStatusProgress[]) {
  const source = context.resultType && context.resultNumber ? progressForResult(resultProgress, context.resultType, context.resultNumber) : (plot.properties.statusProgress ?? []);
  return Object.fromEntries(source.map((entry) => [entry.statusId, { completedAt: toLocalDateTime(entry.completedAt), cost: entry.cost == null ? "" : String(entry.cost) }]));
}

function toProgress(draft: Record<string, DraftEntry>, statuses: PlotStatusDefinition[], strict: boolean, errors: { dateRequired: string; invalidExpense: string }): PlotStatusProgress[] {
  return statuses.flatMap(({ id: statusId }) => {
    const entry = draft[statusId];
    if (!entry) return [];
    const date = new Date(entry.completedAt);
    if (strict && (!entry.completedAt || !Number.isFinite(date.getTime()))) throw new Error(errors.dateRequired);
    const normalizedCost = entry.cost.trim().replace(",", ".");
    const cost = normalizedCost ? Number(normalizedCost) : null;
    if (strict && cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 999_999_999_999.99)) throw new Error(errors.invalidExpense);
    return [{ statusId, completedAt: Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString(), cost }];
  });
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
