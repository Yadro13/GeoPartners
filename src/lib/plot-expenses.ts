import type { PlotFeature } from "@/components/workspace/types";

export function withoutPlotExpenses(feature: PlotFeature): PlotFeature {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      statusProgress: (feature.properties.statusProgress ?? []).map((entry) => {
        return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "cost"));
      }),
    },
  } as PlotFeature;
}

export function clearPlotExpenses(feature: PlotFeature): PlotFeature {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      statusProgress: (feature.properties.statusProgress ?? []).map((entry) => ({ ...entry, cost: null })),
    },
  };
}

export function preservePlotExpenses(feature: PlotFeature, current: PlotFeature): PlotFeature {
  const costs = new Map((current.properties.statusProgress ?? []).map(({ statusId, cost }) => [statusId, cost]));
  return {
    ...feature,
    properties: {
      ...feature.properties,
      statusProgress: (feature.properties.statusProgress ?? []).map((entry) => ({ ...entry, cost: costs.get(entry.statusId) ?? null })),
    },
  };
}

export function plotForExpenseAccess(feature: PlotFeature, canViewExpenses: boolean) {
  return canViewExpenses ? feature : withoutPlotExpenses(feature);
}
