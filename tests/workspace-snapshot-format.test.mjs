import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceSnapshotPayload, hashWorkspaceSnapshot } from "../src/lib/workspace-snapshot-format.ts";

const plot = {
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] },
  properties: {
    id: "plot-1",
    cadastralNumber: "1",
    name: "",
    category: "default",
    areaHa: 1,
    projectCapacity: 0,
    mainCandidateCadastral: "",
    owner: "Owner",
    lessee: "Lessee",
    resultLinks: [{ type: "road", number: "2" }],
    statusProgress: [{ statusId: "status-1", completedAt: "2026-08-06T10:00:00.000Z", cost: 25 }],
  },
};

test("builds a versioned snapshot with an exact capture timestamp", () => {
  const payload = buildWorkspaceSnapshotPayload({
    workspace: "sandbox",
    capturedAt: new Date("2026-08-06T12:00:00.000Z"),
    categories: { default: { name: "Default", description: "", color: "#000000", visible: true, systemRole: "default" } },
    plotStatuses: [{ id: "status-1", name: "Stage 1" }],
    plots: [plot],
  });

  assert.equal(payload.formatVersion, 1);
  assert.equal(payload.workspace, "sandbox");
  assert.equal(payload.capturedAt, "2026-08-06T12:00:00.000Z");
  assert.equal(payload.plots[0].properties.resultLinks[0].number, "2");
  assert.equal(payload.plots[0].properties.statusProgress[0].cost, 25);
});

test("produces a stable integrity hash and detects content changes", () => {
  const payload = buildWorkspaceSnapshotPayload({ workspace: "production", capturedAt: "2026-08-06T12:00:00Z", categories: {}, plotStatuses: [], plots: [plot] });
  const same = buildWorkspaceSnapshotPayload({ workspace: "production", capturedAt: "2026-08-06T12:00:00Z", categories: {}, plotStatuses: [], plots: [plot] });
  const changed = buildWorkspaceSnapshotPayload({ workspace: "production", capturedAt: "2026-08-06T12:00:00Z", categories: {}, plotStatuses: [], plots: [{ ...plot, properties: { ...plot.properties, owner: "Changed" } }] });

  assert.match(hashWorkspaceSnapshot(payload), /^[0-9a-f]{64}$/);
  assert.equal(hashWorkspaceSnapshot(payload), hashWorkspaceSnapshot(same));
  assert.notEqual(hashWorkspaceSnapshot(payload), hashWorkspaceSnapshot(changed));
});

test("keeps the integrity hash stable after PostgreSQL JSONB reorders object keys", () => {
  const categories = { default: { name: "Default", description: "", color: "#000000", visible: true, systemRole: "default" } };
  const plotStatuses = [{ id: "status-1", name: "Stage 1" }];
  const payload = buildWorkspaceSnapshotPayload({ workspace: "production", capturedAt: "2026-07-31T20:00:00.000Z", categories, plotStatuses, plots: [plot] });
  const samePayloadWithDifferentInsertionOrder = {
    plots: payload.plots.map((item) => ({ properties: Object.fromEntries(Object.entries(item.properties).reverse()), geometry: { coordinates: item.geometry.coordinates, type: item.geometry.type }, type: item.type })),
    plotStatuses: payload.plotStatuses.map((status) => ({ name: status.name, id: status.id })),
    categories: Object.fromEntries(Object.entries(payload.categories).map(([id, category]) => [id, Object.fromEntries(Object.entries(category).reverse())])),
    capturedAt: payload.capturedAt,
    workspace: payload.workspace,
    formatVersion: payload.formatVersion,
  };
  assert.equal(hashWorkspaceSnapshot(samePayloadWithDifferentInsertionOrder), hashWorkspaceSnapshot(payload));
});
