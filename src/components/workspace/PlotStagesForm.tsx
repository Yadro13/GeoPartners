"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Coins, Save } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import { totalPlotStatusCost, type PlotStatusProgress } from "@/lib/plot-status-progress";
import type { PlotFeature } from "./types";

type DraftEntry = { completedAt: string; cost: string };

export function PlotStagesForm({ plot, statuses, editable, canManageExpenses, onSave, onClose }: { plot: PlotFeature; statuses: PlotStatusDefinition[]; editable: boolean; canManageExpenses: boolean; onSave?: (plot: PlotFeature) => Promise<void>; onClose: () => void }) {
  const t = useTranslations("stages");
  const common = useTranslations("common");
  const format = useFormatter();
  const initialDraft = useMemo(() => Object.fromEntries((plot.properties.statusProgress ?? []).map((entry) => [entry.statusId, { completedAt: toLocalDateTime(entry.completedAt), cost: entry.cost == null ? "" : String(entry.cost) }])), [plot]);
  const [draft, setDraft] = useState<Record<string, DraftEntry>>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const completedCount = Object.keys(draft).length;
  const errors = { dateRequired: t("dateRequired"), invalidExpense: t("invalidExpense") };
  const totalCost = totalPlotStatusCost(toProgress(draft, statuses, false, errors));

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
    if (!editable || !onSave) return;
    setError("");
    try {
      const statusProgress = toProgress(draft, statuses, true, errors);
      const currentStatus = [...statuses].reverse().find(({ id }) => statusProgress.some((entry) => entry.statusId === id))?.name ?? "";
      setSaving(true);
      await onSave({ ...plot, properties: { ...plot.properties, status: currentStatus, statusProgress } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("saveFailed"));
      setSaving(false);
    }
  };

  return <form className="plot-stages" onSubmit={submit}>
    <div className="plot-stages__summary"><span>{t("summary", { done: completedCount, total: statuses.length })}</span>{canManageExpenses ? <span><Coins size={16} />{format.number(totalCost, { style: "currency", currency: "UAH" })}</span> : null}</div>
    <div className="plot-stages__list">
      {statuses.map((status, index) => {
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
