import type { WorkspaceSnapshotPayload } from "./workspace-snapshot-format";

export type SnapshotMetric = {
  id: string;
  name: string;
  current: number;
  delta: number | null;
};

export type SnapshotKpis = {
  plots: SnapshotMetric;
  statuses: SnapshotMetric[];
};

export function buildSnapshotKpis(current: WorkspaceSnapshotPayload, previous: WorkspaceSnapshotPayload | null): SnapshotKpis {
  const previousStatusCounts = previous ? countCompletedStatuses(previous) : null;
  const currentStatusCounts = countCompletedStatuses(current);
  return {
    plots: {
      id: "plots",
      name: "plots",
      current: current.plots.length,
      delta: previous ? current.plots.length - previous.plots.length : null,
    },
    statuses: current.plotStatuses.map((status) => {
      const count = currentStatusCounts.get(status.id) ?? 0;
      return {
        id: status.id,
        name: status.name,
        current: count,
        delta: previousStatusCounts ? count - (previousStatusCounts.get(status.id) ?? 0) : null,
      };
    }),
  };
}

function countCompletedStatuses(payload: WorkspaceSnapshotPayload) {
  const counts = new Map<string, number>();
  for (const plot of payload.plots) {
    for (const statusId of new Set((plot.properties.statusProgress ?? []).map(({ statusId }) => statusId))) {
      counts.set(statusId, (counts.get(statusId) ?? 0) + 1);
    }
  }
  for (const entry of payload.resultStatusProgress ?? []) {
    counts.set(entry.statusId, (counts.get(entry.statusId) ?? 0) + 1);
  }
  return counts;
}
