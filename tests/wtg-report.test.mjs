import assert from "node:assert/strict";
import test from "node:test";
import { buildResultReportGroups } from "../src/lib/result-report.ts";

const defaultCategories = {
  planned_wtg: { name: "Main", description: "", color: "#000000", visible: true, systemRole: "main_candidate" },
  alt_candidates: { name: "Alternative", description: "", color: "#000000", visible: true, systemRole: "alternative_candidate" },
  wtg: { name: "WTG", description: "", color: "#000000", visible: true, systemRole: "wtg_result" },
  roads: { name: "Road", description: "", color: "#000000", visible: true, systemRole: "road_result" },
  servitudes: { name: "Easement", description: "", color: "#000000", visible: true, systemRole: "servitude_result" },
  substations: { name: "Substation", description: "", color: "#000000", visible: true, systemRole: "substation_result" },
};

function plot(id, category, links, progress = []) {
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] }, properties: { id, cadastralNumber: id, name: id, category, areaHa: 1, projectCapacity: 0, mainCandidateCadastral: "", owner: `${id} owner`, lessee: `${id} lessee`, resultLinks: links, statusProgress: progress } };
}

test("groups main, alternative, and final plots by WTG number", () => {
  const groups = buildResultReportGroups([
    plot("main", "planned_wtg", [{ type: "wtg", number: "WTG-01" }]),
    plot("alt", "alt_candidates", [{ type: "wtg", number: "wtg-01" }]),
    plot("final", "wtg", [{ type: "wtg", number: "WTG-01" }]),
  ], defaultCategories, "wtg", [{ resultType: "wtg", resultNumber: "wtg-01", statusId: "s1", completedAt: "2026-08-01T10:00:00Z", cost: 125 }]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].mainCandidates[0].properties.id, "main");
  assert.equal(groups[0].alternativeCandidates[0].properties.id, "alt");
  assert.equal(groups[0].finalPlots[0].properties.id, "final");
  assert.equal(groups[0].completedCount, 1);
  assert.equal(groups[0].totalCost, 125);
});

test("places each plot into its single WTG group and sorts numbers naturally", () => {
  const groups = buildResultReportGroups([
    plot("ten", "planned_wtg", [{ type: "wtg", number: "10" }]),
    plot("two", "planned_wtg", [{ type: "wtg", number: "2" }]),
  ], defaultCategories, "wtg");

  assert.deepEqual(groups.map(({ number }) => number), ["2", "10"]);
  assert.deepEqual(groups.map(({ primary }) => primary?.properties.id), ["two", "ten"]);
});

test("builds equivalent groups for every result type", () => {
  const types = ["wtg", "road", "servitude", "substation"];
  const finalCategories = { wtg: "wtg", road: "roads", servitude: "servitudes", substation: "substations" };
  const links = types.map((type) => ({ type, number: `${type}-7` }));
  const plots = [
    plot("main", "planned_wtg", links),
    plot("alternative", "alt_candidates", links),
    ...types.map((type) => plot(`final-${type}`, finalCategories[type], [{ type, number: `${type}-7` }])),
  ];

  for (const type of types) {
    const [group] = buildResultReportGroups(plots, defaultCategories, type, [{ resultType: type, resultNumber: `${type}-7`, statusId: "s1", completedAt: "2026-08-01T10:00:00Z", cost: 75 }]);
    assert.equal(group.type, type);
    assert.equal(group.primary.properties.id, "main");
    assert.equal(group.alternativeCandidates[0].properties.id, "alternative");
    assert.equal(group.finalPlots[0].properties.id, `final-${type}`);
    assert.equal(group.totalCost, 75);
  }
});

test("keeps progress independent for each result type and number", () => {
  const plots = [
    plot("wtg-1", "planned_wtg", [{ type: "wtg", number: "1" }]),
    plot("wtg-2", "planned_wtg", [{ type: "wtg", number: "2" }]),
    plot("road-1", "planned_wtg", [{ type: "road", number: "1" }]),
  ];
  const progress = [
    { resultType: "wtg", resultNumber: "1", statusId: "wtg_status_01", completedAt: "2026-08-01T10:00:00Z", cost: 10 },
    { resultType: "wtg", resultNumber: "2", statusId: "wtg_status_02", completedAt: "2026-08-02T10:00:00Z", cost: 20 },
    { resultType: "road", resultNumber: "1", statusId: "road_status_03", completedAt: "2026-08-03T10:00:00Z", cost: 30 },
  ];

  const wtg = buildResultReportGroups(plots, defaultCategories, "wtg", progress);
  const road = buildResultReportGroups(plots, defaultCategories, "road", progress);
  assert.deepEqual(wtg.map((group) => [...group.progress.keys()]), [["wtg_status_01"], ["wtg_status_02"]]);
  assert.deepEqual(wtg.map(({ totalCost }) => totalCost), [10, 20]);
  assert.deepEqual([...road[0].progress.keys()], ["road_status_03"]);
  assert.equal(road[0].totalCost, 30);
});
