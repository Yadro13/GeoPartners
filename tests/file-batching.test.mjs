import assert from "node:assert/strict";
import test from "node:test";
import { packFileGroupsByLimits } from "../src/lib/file-batching.ts";

test("packs 300 GeoJSON/PDF pairs without a user-facing file-count limit", () => {
  const groups = Array.from({ length: 300 }, (_, index) => [
    { name: `${index}.geojson`, size: 500 },
    { name: `${index}.pdf`, size: 64_000 },
  ]);

  const batches = packFileGroupsByLimits(groups, { files: 60, bytes: 100 * 1024 * 1024 });

  assert.equal(batches.length, 10);
  assert.equal(batches.flat().length, 600);
  assert.ok(batches.every((batch) => batch.length <= 60));
});

test("keeps every GeoJSON/PDF pair in the same technical batch", () => {
  const groups = Array.from({ length: 31 }, (_, index) => [
    { name: `${index}.geojson`, size: 1 },
    { name: `${index}.pdf`, size: 1 },
  ]);

  const batches = packFileGroupsByLimits(groups, { files: 60, bytes: 1_000 });

  assert.deepEqual(batches.map((batch) => batch.length), [60, 2]);
  assert.deepEqual(batches[1].map(({ name }) => name), ["30.geojson", "30.pdf"]);
});
