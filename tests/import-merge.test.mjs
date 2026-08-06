import assert from "node:assert/strict";
import test from "node:test";
import { mergeExistingPlotForImport } from "../src/lib/import-merge.ts";

const geometry = (offset = 0) => ({ type: "Polygon", coordinates: [[[offset, 0], [offset + 1, 0], [offset + 1, 1], [offset, 0]]] });
const feature = (overrides = {}) => ({
  type: "Feature",
  geometry: geometry(),
  properties: {
    id: "plot-1", cadastralNumber: "6820982100:04:051:0018", name: "Current name", category: "planned_wtg",
    areaHa: 4, projectCapacity: 2, mainCandidateCadastral: "legacy", owner: "Current owner", lessee: "Current lessee",
    documentActualAt: "2026-08-05T10:00:00.000Z", resultLinks: [{ type: "wtg", number: "1" }],
    status: "Stage 1", statusProgress: [{ statusId: "status-1", completedAt: "2026-08-01T10:00:00.000Z", cost: 100 }],
    roadOwnershipType: "private", servitudeValidFrom: "2026-01-01", servitudePaymentAmount: 50,
    substationType: "Current type", substationCapacityMw: 20, hasDocument: true, documentName: "current.pdf",
    ...overrides,
  },
});

test("repeat import updates geometry and area but preserves manually managed fields", () => {
  const current = feature();
  const imported = feature({ id: "new-id", name: "Imported name", category: "default", areaHa: 5, projectCapacity: 0, mainCandidateCadastral: "", resultLinks: [], status: "", statusProgress: [] });
  imported.geometry = geometry(2);
  const result = mergeExistingPlotForImport(imported, current);
  assert.deepEqual(result.plot.geometry, imported.geometry);
  assert.equal(result.plot.properties.areaHa, 5);
  assert.equal(result.plot.properties.name, "Current name");
  assert.equal(result.plot.properties.category, "planned_wtg");
  assert.equal(result.plot.properties.projectCapacity, 2);
  assert.deepEqual(result.plot.properties.resultLinks, current.properties.resultLinks);
  assert.deepEqual(result.plot.properties.statusProgress, current.properties.statusProgress);
});

test("empty imported values never clear existing values and missing current values are filled", () => {
  const current = feature({ owner: "", lessee: "Current lessee", substationCapacityMw: 20 });
  const imported = feature({ owner: "Imported owner", lessee: "", substationCapacityMw: null });
  const result = mergeExistingPlotForImport(imported, current);
  assert.equal(result.plot.properties.owner, "Imported owner");
  assert.equal(result.plot.properties.lessee, "Current lessee");
  assert.equal(result.plot.properties.substationCapacityMw, 20);
});

test("a strictly newer PDF defaults metadata and document to imported", () => {
  const current = feature();
  const imported = feature({ owner: "New owner", lessee: "New lessee", documentActualAt: "2026-08-06T10:00:00.000Z" });
  const result = mergeExistingPlotForImport(imported, current, { incomingDocumentName: "new.pdf" });
  assert.equal(result.plot.properties.owner, "New owner");
  assert.equal(result.plot.properties.lessee, "New lessee");
  assert.equal(result.includeDocument, true);
  assert.ok(result.fieldConflicts.every(({ resolution }) => resolution === "imported"));
  assert.equal(result.plot.properties.importDecisions.document, "imported");
  assert.equal(result.plot.properties.importDecisions.fields.owner, "imported");
});

test("server merge honors the preview document choice after the date field is kept current", () => {
  const current = feature();
  const preview = mergeExistingPlotForImport(feature({ owner: "New owner", documentActualAt: "2026-08-06T10:00:00.000Z" }), current, { incomingDocumentName: "new.pdf" });
  const reviewed = { ...preview.plot, properties: { ...preview.plot.properties, documentActualAt: current.properties.documentActualAt, importDecisions: { ...preview.plot.properties.importDecisions, fields: { ...preview.plot.properties.importDecisions.fields, documentActualAt: "current" } } } };
  const server = mergeExistingPlotForImport(reviewed, current, { incomingDocumentName: "new.pdf", decisions: reviewed.properties.importDecisions });
  assert.equal(server.includeDocument, true);
  assert.equal(server.plot.properties.owner, "New owner");
  assert.equal(server.plot.properties.documentActualAt, current.properties.documentActualAt);
});

test("an equal, older, or incomparable PDF is not newer and defaults to current", () => {
  for (const documentActualAt of ["2026-08-05T10:00:00.000Z", "2026-08-04T10:00:00.000Z", "unknown"]) {
    const result = mergeExistingPlotForImport(feature({ owner: "New owner", documentActualAt }), feature(), { incomingDocumentName: "new.pdf" });
    assert.equal(result.plot.properties.owner, "Current owner");
    assert.equal(result.includeDocument, false);
    assert.equal(result.documentConflict?.reason, "not-newer-document");
  }
});

test("an explicit imported decision overrides the safe default", () => {
  const imported = feature({ owner: "New owner", documentActualAt: "2026-08-04T10:00:00.000Z" });
  const result = mergeExistingPlotForImport(imported, feature(), {
    incomingDocumentName: "older.pdf",
    decisions: { fields: { owner: "imported" }, document: "imported" },
  });
  assert.equal(result.plot.properties.owner, "New owner");
  assert.equal(result.includeDocument, true);
  assert.equal(result.fieldConflicts.find(({ field }) => field === "owner")?.resolution, "imported");
});

test("special-field conflicts preserve current values by default", () => {
  const imported = feature({ roadOwnershipType: "municipal", servitudePaymentAmount: 75, substationType: "New type" });
  const result = mergeExistingPlotForImport(imported, feature());
  assert.equal(result.plot.properties.roadOwnershipType, "private");
  assert.equal(result.plot.properties.servitudePaymentAmount, 50);
  assert.equal(result.plot.properties.substationType, "Current type");
  assert.equal(result.fieldConflicts.length, 3);
});
