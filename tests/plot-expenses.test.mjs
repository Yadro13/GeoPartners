import assert from "node:assert/strict";
import test from "node:test";
import { clearPlotExpenses, preservePlotExpenses, withoutPlotExpenses } from "../src/lib/plot-expenses.ts";

function feature(progress) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[30, 50], [30.1, 50], [30.1, 50.1], [30, 50]]] },
    properties: {
      id: "plot-1",
      name: "Plot 1",
      cadastralNumber: "6820982100:04:051:0018",
      category: "default",
      areaHa: 1,
      owner: "Owner",
      lessee: "Lessee",
      status: "Stage 2",
      statusProgress: progress,
    },
  };
}

test("removes expense values without changing stage progress", () => {
  const source = feature([{ statusId: "s1", completedAt: "2026-08-06T10:00:00.000Z", cost: 125.5 }]);
  const safe = withoutPlotExpenses(source);
  assert.deepEqual(safe.properties.statusProgress, [{ statusId: "s1", completedAt: "2026-08-06T10:00:00.000Z" }]);
  assert.equal(source.properties.statusProgress[0].cost, 125.5);
});

test("preserves stored expenses when a user edits dates and stages", () => {
  const current = feature([
    { statusId: "s1", completedAt: "2026-08-06T10:00:00.000Z", cost: 125.5 },
    { statusId: "s2", completedAt: "2026-08-06T11:00:00.000Z", cost: 300 },
  ]);
  const submitted = feature([
    { statusId: "s1", completedAt: "2026-08-07T10:00:00.000Z", cost: 999999 },
    { statusId: "s3", completedAt: "2026-08-07T12:00:00.000Z", cost: 75 },
  ]);
  const saved = preservePlotExpenses(submitted, current);
  assert.deepEqual(saved.properties.statusProgress, [
    { statusId: "s1", completedAt: "2026-08-07T10:00:00.000Z", cost: 125.5 },
    { statusId: "s3", completedAt: "2026-08-07T12:00:00.000Z", cost: null },
  ]);
});

test("clears expenses on user-created progress", () => {
  const source = feature([{ statusId: "s1", completedAt: "2026-08-06T10:00:00.000Z", cost: 125.5 }]);
  assert.equal(clearPlotExpenses(source).properties.statusProgress[0].cost, null);
});
