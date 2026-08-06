import assert from "node:assert/strict";
import test from "node:test";
import {
  appendImportFile,
  importFilePath,
  importPathStem,
  matchImportDocument,
  normalizeImportPath,
  uploadedImportFiles,
} from "../src/lib/import-file-path.ts";

test("preserves the recursive path reported by a directory picker", () => {
  const file = new File(["{}"], "plot.geojson", { type: "application/geo+json" });
  Object.defineProperty(file, "webkitRelativePath", { value: "root\\sector-a\\nested\\plot.geojson" });

  assert.equal(importFilePath(file), "root/sector-a/nested/plot.geojson");
  assert.equal(importPathStem(importFilePath(file)), "root/sector-a/nested/plot");
});

test("restores relative paths after multipart upload", () => {
  const source = new File(["{}"], "root/sector-a/plot.geojson", { type: "application/geo+json" });
  const form = new FormData();
  appendImportFile(form, source);

  const [restored] = uploadedImportFiles(form);
  assert.equal(restored.name, "root/sector-a/plot.geojson");
  assert.equal(restored.type, source.type);
});

test("pairs documents only inside the GeoJSON directory", () => {
  const documents = [
    { name: "root/sector-a/plot.pdf", stem: "root/sector-a/plot", cadastralNumber: "6820982100:04:051:0018" },
    { name: "root/sector-b/plot.pdf", stem: "root/sector-b/plot", cadastralNumber: "6820982100:04:051:0019" },
  ];

  const first = matchImportDocument("root/sector-a/plot.geojson", "6820982100:04:051:0018", documents);
  const second = matchImportDocument("root/sector-b/plot.geojson", "6820982100:04:051:0019", documents);

  assert.equal(first.document?.name, "root/sector-a/plot.pdf");
  assert.equal(second.document?.name, "root/sector-b/plot.pdf");
});

test("does not borrow a PDF with the same basename from another nested directory", () => {
  const documents = [
    { name: "root/sector-b/plot.pdf", stem: "root/sector-b/plot", cadastralNumber: "6820982100:04:051:0018" },
  ];

  const match = matchImportDocument("root/sector-a/plot.geojson", "6820982100:04:051:0018", documents);
  assert.equal(match.document, null);
  assert.equal(match.ambiguous, false);
});

test("uses a unique cadastral match in the same directory and rejects ambiguous matches", () => {
  const unique = matchImportDocument("root/sector-a/coordinates.geojson", "6820982100:04:051:0018", [
    { name: "root/sector-a/extract.pdf", stem: "root/sector-a/extract", cadastralNumber: "6820982100:04:051:0018" },
  ]);
  const ambiguous = matchImportDocument("root/sector-a/coordinates.geojson", "6820982100:04:051:0018", [
    { name: "root/sector-a/extract-1.pdf", stem: "root/sector-a/extract-1", cadastralNumber: "6820982100:04:051:0018" },
    { name: "root/sector-a/extract-2.pdf", stem: "root/sector-a/extract-2", cadastralNumber: "6820982100:04:051:0018" },
  ]);

  assert.equal(unique.document?.name, "root/sector-a/extract.pdf");
  assert.equal(ambiguous.document, null);
  assert.equal(ambiguous.ambiguous, true);
});

test("rejects traversal and absolute paths", () => {
  assert.throws(() => normalizeImportPath("../plot.geojson"));
  assert.throws(() => normalizeImportPath("C:/plots/plot.geojson"));
  assert.throws(() => normalizeImportPath("/plots/plot.geojson"));
});
