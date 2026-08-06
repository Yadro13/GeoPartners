import assert from "node:assert/strict";
import test from "node:test";
import { buildWtgReportGroups } from "../src/lib/wtg-report.ts";

const defaultCategories = {
  planned_wtg: { name: "Main", description: "", color: "#000000", visible: true, systemRole: "main_candidate" },
  alt_candidates: { name: "Alternative", description: "", color: "#000000", visible: true, systemRole: "alternative_candidate" },
  wtg: { name: "WTG", description: "", color: "#000000", visible: true, systemRole: "wtg_result" },
};

function plot(id, category, links, progress = []) {
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] }, properties: { id, cadastralNumber: id, name: id, category, areaHa: 1, projectCapacity: 0, mainCandidateCadastral: "", owner: `${id} owner`, lessee: `${id} lessee`, resultLinks: links, statusProgress: progress } };
}

test("groups main, alternative, and final plots by WTG number", () => {
  const groups = buildWtgReportGroups([
    plot("main", "planned_wtg", [{ type: "wtg", number: "WTG-01" }], [{ statusId: "s1", completedAt: "2026-08-01T10:00:00Z", cost: 125 }]),
    plot("alt", "alt_candidates", [{ type: "wtg", number: "wtg-01" }]),
    plot("final", "wtg", [{ type: "wtg", number: "WTG-01" }]),
  ], defaultCategories);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].mainCandidates[0].properties.id, "main");
  assert.equal(groups[0].alternativeCandidates[0].properties.id, "alt");
  assert.equal(groups[0].finalPlots[0].properties.id, "final");
  assert.equal(groups[0].completedCount, 1);
  assert.equal(groups[0].totalCost, 125);
});

test("places each plot into its single WTG group and sorts numbers naturally", () => {
  const groups = buildWtgReportGroups([
    plot("ten", "planned_wtg", [{ type: "wtg", number: "10" }]),
    plot("two", "planned_wtg", [{ type: "wtg", number: "2" }]),
  ], defaultCategories);

  assert.deepEqual(groups.map(({ number }) => number), ["2", "10"]);
  assert.deepEqual(groups.map(({ primary }) => primary?.properties.id), ["two", "ten"]);
});
