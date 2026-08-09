import type { CategoryDefinition } from "../data/demo";
import type { PlotFeature } from "../components/workspace/types";
import { parsePlotResultLinks, type PlotResultType } from "./plot-result-links.ts";
import { totalPlotStatusCost } from "./plot-status-progress.ts";
import { progressForResult, type ResultStatusProgress } from "./result-status-progress.ts";

type ProgressEntry = NonNullable<PlotFeature["properties"]["statusProgress"]>[number];

export type ResultReportGroup = {
  key: string;
  type: PlotResultType;
  number: string;
  mainCandidates: PlotFeature[];
  alternativeCandidates: PlotFeature[];
  finalPlots: PlotFeature[];
  otherPlots: PlotFeature[];
  primary: PlotFeature | null;
  progress: Map<string, ProgressEntry>;
  completedCount: number;
  totalCost: number;
};

const finalRoleByType = {
  wtg: "wtg_result",
  road: "road_result",
  servitude: "servitude_result",
  substation: "substation_result",
} as const;

export function buildResultReportGroups(plots: PlotFeature[], categories: Record<string, CategoryDefinition>, type: PlotResultType, resultProgress: ResultStatusProgress[] = []) {
  const groups = new Map<string, Omit<ResultReportGroup, "primary" | "progress" | "completedCount" | "totalCost">>();

  for (const plot of plots) {
    if (categories[plot.properties.category]?.visible === false) continue;
    const role = categories[plot.properties.category]?.systemRole;
    for (const link of parsePlotResultLinks(plot.properties.resultLinks).filter((item) => item.type === type)) {
      const key = link.number.toLocaleLowerCase();
      const group = groups.get(key) ?? { key: `${type}:${key}`, type, number: link.number, mainCandidates: [], alternativeCandidates: [], finalPlots: [], otherPlots: [] };
      const destination = role === "main_candidate" ? group.mainCandidates : role === "alternative_candidate" ? group.alternativeCandidates : role === finalRoleByType[type] ? group.finalPlots : group.otherPlots;
      if (!destination.some(({ properties }) => properties.id === plot.properties.id)) destination.push(plot);
      groups.set(key, group);
    }
  }

  const collator = new Intl.Collator("uk", { numeric: true, sensitivity: "base" });
  return [...groups.values()].map((group): ResultReportGroup => {
    const primary = group.mainCandidates[0] ?? null;
    const entries = progressForResult(resultProgress, type, group.number);
    return { ...group, primary, progress: new Map(entries.map((entry) => [entry.statusId, entry])), completedCount: entries.length, totalCost: totalPlotStatusCost(entries) };
  }).sort((left, right) => collator.compare(left.number, right.number));
}

export function resultGroupPlots(group: ResultReportGroup) {
  return [...group.mainCandidates, ...group.alternativeCandidates, ...group.finalPlots, ...group.otherPlots];
}
