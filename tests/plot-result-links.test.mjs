import assert from "node:assert/strict";
import test from "node:test";
import { parsePlotResultLinks } from "../src/lib/plot-result-links.ts";

test("keeps multiple result numbers for one work type", () => {
  assert.deepEqual(parsePlotResultLinks([
    { type: "wtg", number: "  WTG 01  " },
    { type: "wtg", number: "WTG 02" },
    { type: "road", number: "R-1" },
  ]), [
    { type: "wtg", number: "WTG 01" },
    { type: "wtg", number: "WTG 02" },
    { type: "road", number: "R-1" },
  ]);
});

test("drops blank, unknown, and duplicate result links", () => {
  assert.deepEqual(parsePlotResultLinks([
    { type: "wtg", number: "WTG 01" },
    { type: "wtg", number: "wtg 01" },
    { type: "road", number: "   " },
    { type: "unknown", number: "1" },
    null,
  ]), [{ type: "wtg", number: "WTG 01" }]);
});

test("limits imported links and number length", () => {
  const links = Array.from({ length: 120 }, (_, index) => ({ type: "substation", number: `${index}-${"x".repeat(100)}` }));
  const parsed = parsePlotResultLinks(links);

  assert.equal(parsed.length, 100);
  assert.equal(parsed[0].number.length, 80);
});
