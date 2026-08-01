"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Coins, Save } from "lucide-react";
import type { PlotStatusDefinition } from "@/data/plot-statuses";
import { totalPlotStatusCost, type PlotStatusProgress } from "@/lib/plot-status-progress";
import type { PlotFeature } from "./types";

type DraftEntry = { completedAt: string; cost: string };

export function PlotStagesForm({ plot, statuses, editable, onSave, onClose }: { plot: PlotFeature; statuses: PlotStatusDefinition[]; editable: boolean; onSave?: (plot: PlotFeature) => Promise<void>; onClose: () => void }) {
  const initialDraft = useMemo(() => Object.fromEntries((plot.properties.statusProgress ?? []).map((entry) => [entry.statusId, { completedAt: toLocalDateTime(entry.completedAt), cost: entry.cost === null ? "" : String(entry.cost) }])), [plot]);
  const [draft, setDraft] = useState<Record<string, DraftEntry>>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const completedCount = Object.keys(draft).length;
  const totalCost = totalPlotStatusCost(toProgress(draft, statuses, false));

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
      const statusProgress = toProgress(draft, statuses, true);
      const currentStatus = [...statuses].reverse().find(({ id }) => statusProgress.some((entry) => entry.statusId === id))?.name ?? "";
      setSaving(true);
      await onSave({ ...plot, properties: { ...plot.properties, status: currentStatus, statusProgress } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не вдалося зберегти етапи.");
      setSaving(false);
    }
  };

  return <form className="plot-stages" onSubmit={submit}>
    <div className="plot-stages__summary"><span><strong>{completedCount}</strong> із {statuses.length} пройдено</span><span><Coins size={16} />{formatCost(totalCost)}</span></div>
    <div className="plot-stages__list">
      {statuses.map((status, index) => {
        const entry = draft[status.id];
        return <section className="plot-stage-row" data-completed={Boolean(entry)} key={status.id}>
          <label className="plot-stage-row__check"><input type="checkbox" checked={Boolean(entry)} disabled={!editable} onChange={(event) => toggle(status.id, event.target.checked)} /><span className="plot-stage-row__number">{index + 1}</span><strong>{status.name}</strong></label>
          {entry ? editable ? <div className="plot-stage-row__fields">
            <label><span><CalendarClock size={15} />Дата й час</span><input aria-label={`Дата й час: ${status.name}`} type="datetime-local" value={entry.completedAt} required onChange={(event) => update(status.id, { completedAt: event.target.value })} /></label>
            <label><span><Coins size={15} />Витрати, грн</span><input aria-label={`Витрати: ${status.name}`} type="number" min="0" max="999999999999.99" step="0.01" inputMode="decimal" placeholder="Не вказано" value={entry.cost} onChange={(event) => update(status.id, { cost: event.target.value })} /></label>
          </div> : <dl className="plot-stage-row__readout"><div><dt>Дата й час</dt><dd>{formatDate(entry.completedAt)}</dd></div><div><dt>Витрати</dt><dd>{entry.cost ? formatCost(Number(entry.cost)) : "Не вказано"}</dd></div></dl> : null}
        </section>;
      })}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <footer className="form-actions"><span /><button type="button" onClick={onClose}>{editable ? "Скасувати" : "Закрити"}</button>{editable ? <button className="command-button--primary" type="submit" disabled={saving}><Save size={17} />{saving ? "Збереження…" : "Зберегти етапи"}</button> : null}</footer>
  </form>;
}

function toProgress(draft: Record<string, DraftEntry>, statuses: PlotStatusDefinition[], strict: boolean): PlotStatusProgress[] {
  return statuses.flatMap(({ id: statusId }) => {
    const entry = draft[statusId];
    if (!entry) return [];
    const date = new Date(entry.completedAt);
    if (strict && (!entry.completedAt || !Number.isFinite(date.getTime()))) throw new Error("Для кожного пройденого етапу вкажіть дату й час.");
    const normalizedCost = entry.cost.trim().replace(",", ".");
    const cost = normalizedCost ? Number(normalizedCost) : null;
    if (strict && cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 999_999_999_999.99)) throw new Error("Вкажіть коректну невід’ємну суму витрат.");
    return [{ statusId, completedAt: Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString(), cost }];
  });
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" }) : "Не вказано";
}

function formatCost(value: number) {
  return `${value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`;
}
