import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceSnapshotPayload } from "../src/lib/workspace-snapshot-format.ts";
import { buildSnapshotKpis } from "../src/lib/snapshot-report.ts";
import { getKyivSnapshotSchedule, snapshotRetentionCutoff } from "../src/lib/snapshot-schedule.ts";

const categories = { default: { name: "Без категорії", description: "", color: "#000000", visible: true } };
const statuses = [{ id: "one", name: "Перший" }, { id: "two", name: "Другий" }];

test("computes current snapshot totals and deltas against the immediately previous snapshot", () => {
  const previous = payload("2026-07-31T20:00:00.000Z", [plot("a", ["one"]), plot("b", [])]);
  const current = payload("2026-08-07T20:00:00.000Z", [plot("a", ["one", "two"]), plot("b", ["one"]), plot("c", [])]);
  assert.deepEqual(buildSnapshotKpis(current, previous), {
    plots: { id: "plots", name: "plots", current: 3, delta: 1 },
    statuses: [
      { id: "one", name: "Перший", current: 2, delta: 1 },
      { id: "two", name: "Другий", current: 1, delta: 1 },
    ],
  });
});

test("does not invent deltas for the first historical snapshot", () => {
  const kpis = buildSnapshotKpis(payload("2026-08-07T20:00:00.000Z", [plot("a", ["one"])]), null);
  assert.equal(kpis.plots.delta, null);
  assert(kpis.statuses.every(({ delta }) => delta === null));
});

test("counts result stages independently from plot stages", () => {
  const current = buildWorkspaceSnapshotPayload({
    workspace: "production",
    capturedAt: "2026-08-07T20:00:00.000Z",
    categories,
    plotStatuses: [...statuses, { id: "road-one", name: "Road first", scope: "road" }],
    resultStatusProgress: [
      { resultType: "road", resultNumber: "1", statusId: "road-one", completedAt: "2026-08-07T12:00:00.000Z", cost: null },
      { resultType: "road", resultNumber: "2", statusId: "road-one", completedAt: "2026-08-07T13:00:00.000Z", cost: null },
    ],
    plots: [],
  });
  assert.equal(buildSnapshotKpis(current, null).statuses.find(({ id }) => id === "road-one")?.current, 2);
});

test("Kyiv Friday schedule follows summer and winter UTC offsets", () => {
  assert.deepEqual(getKyivSnapshotSchedule(new Date("2026-08-07T20:00:00.000Z")), { due: true, scheduleKey: "2026-08-07" });
  assert.deepEqual(getKyivSnapshotSchedule(new Date("2026-12-04T21:00:00.000Z")), { due: true, scheduleKey: "2026-12-04" });
  assert.equal(getKyivSnapshotSchedule(new Date("2026-08-07T19:59:00.000Z")).due, false);
  assert.equal(snapshotRetentionCutoff(new Date("2026-08-07T20:00:00.000Z")).toISOString(), "2026-05-09T20:00:00.000Z");
});

function payload(capturedAt, plots) {
  return buildWorkspaceSnapshotPayload({ workspace: "production", capturedAt, categories, plotStatuses: statuses, plots });
}

function plot(id, completed) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[26, 49], [26.1, 49], [26, 49.1], [26, 49]]] },
    properties: { id, cadastralNumber: id, name: id, category: "default", areaHa: 1, projectCapacity: 0, mainCandidateCadastral: "", owner: "", lessee: "", statusProgress: completed.map((statusId) => ({ statusId, completedAt: "2026-08-01T00:00:00.000Z", cost: null })) },
  };
}
