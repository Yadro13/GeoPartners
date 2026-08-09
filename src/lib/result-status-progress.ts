import { plotResultTypes, type PlotResultType } from "./plot-result-links.ts";
import { parsePlotStatusProgress, totalPlotStatusCost, type PlotStatusProgress } from "./plot-status-progress.ts";

export type ResultStatusProgress = PlotStatusProgress & {
  resultType: PlotResultType;
  resultNumber: string;
};

export function resultProgressContextKey(resultType: PlotResultType, resultNumber: string) {
  return `${resultType}:${normalizeResultNumber(resultNumber)}`;
}

export function normalizeResultNumber(resultNumber: string) {
  return resultNumber.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
}

export function parseResultStatusProgress(value: unknown): ResultStatusProgress[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Некоректний список етапів результату.");
  const contexts = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Некоректний запис етапу результату.");
    const candidate = item as { resultType?: unknown; resultNumber?: unknown };
    if (!plotResultTypes.includes(candidate.resultType as PlotResultType)) throw new Error("Некоректний тип результату.");
    const resultNumber = typeof candidate.resultNumber === "string" ? candidate.resultNumber.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    if (!resultNumber) throw new Error("Вкажіть номер результату.");
    return { resultType: candidate.resultType as PlotResultType, resultNumber };
  });
  const progress = parsePlotStatusProgress(value);
  return progress.map((entry, index) => ({ ...entry, ...contexts[index] }));
}

export function progressForResult(entries: ResultStatusProgress[], resultType: PlotResultType, resultNumber: string) {
  const key = resultProgressContextKey(resultType, resultNumber);
  return entries.filter((entry) => resultProgressContextKey(entry.resultType, entry.resultNumber) === key);
}

export function totalResultStatusCost(entries: ResultStatusProgress[]) {
  return totalPlotStatusCost(entries);
}

export function withoutResultExpenses(entries: ResultStatusProgress[]) {
  return entries.map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "cost"))) as ResultStatusProgress[];
}
