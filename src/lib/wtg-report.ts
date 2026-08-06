import type { CategoryDefinition } from "../data/demo";
import type { PlotFeature } from "../components/workspace/types";
import { parsePlotResultLinks } from "./plot-result-links.ts";
import { totalPlotStatusCost } from "./plot-status-progress.ts";

type ProgressEntry = NonNullable<PlotFeature["properties"]["statusProgress"]>[number];

export type WtgReportGroup = {
  key: string;
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

export function buildWtgReportGroups(plots: PlotFeature[], categories: Record<string, CategoryDefinition>) {
  const groups = new Map<string, Omit<WtgReportGroup, "primary" | "progress" | "completedCount" | "totalCost">>();

  for (const plot of plots) {
    if (categories[plot.properties.category]?.visible === false) continue;
    const role = categories[plot.properties.category]?.systemRole;
    for (const link of parsePlotResultLinks(plot.properties.resultLinks).filter(({ type }) => type === "wtg")) {
      const key = link.number.toLocaleLowerCase();
      const group = groups.get(key) ?? { key, number: link.number, mainCandidates: [], alternativeCandidates: [], finalPlots: [], otherPlots: [] };
      const destination = role === "main_candidate" ? group.mainCandidates : role === "alternative_candidate" ? group.alternativeCandidates : role === "wtg_result" ? group.finalPlots : group.otherPlots;
      if (!destination.some(({ properties }) => properties.id === plot.properties.id)) destination.push(plot);
      groups.set(key, group);
    }
  }

  const collator = new Intl.Collator("uk", { numeric: true, sensitivity: "base" });
  return [...groups.values()].map((group): WtgReportGroup => {
    const primary = group.mainCandidates[0] ?? null;
    const entries = primary?.properties.statusProgress ?? [];
    return { ...group, primary, progress: new Map(entries.map((entry) => [entry.statusId, entry])), completedCount: entries.length, totalCost: totalPlotStatusCost(entries) };
  }).sort((left, right) => collator.compare(left.number, right.number));
}

export function wtgGroupPlots(group: WtgReportGroup) {
  return [...group.mainCandidates, ...group.alternativeCandidates, ...group.finalPlots, ...group.otherPlots];
}
