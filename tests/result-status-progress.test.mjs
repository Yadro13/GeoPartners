import assert from "node:assert/strict";
import test from "node:test";
import { parseResultStatusProgress, progressForResult, resultProgressContextKey } from "../src/lib/result-status-progress.ts";

test("normalizes a result context and stage values", () => {
  const [entry] = parseResultStatusProgress([{ resultType: "wtg", resultNumber: " WTG  1 ", statusId: "wtg_status_01", completedAt: "2026-08-09T12:00:00+03:00", cost: "12.345" }]);
  assert.equal(entry.resultNumber, "WTG 1");
  assert.equal(entry.completedAt, "2026-08-09T09:00:00.000Z");
  assert.equal(entry.cost, 12.35);
});

test("matches type and number case-insensitively without mixing contexts", () => {
  const entries = [
    { resultType: "wtg", resultNumber: "WTG-1", statusId: "one", completedAt: "2026-08-09T09:00:00.000Z", cost: null },
    { resultType: "wtg", resultNumber: "WTG-2", statusId: "two", completedAt: "2026-08-09T09:00:00.000Z", cost: null },
    { resultType: "road", resultNumber: "WTG-1", statusId: "three", completedAt: "2026-08-09T09:00:00.000Z", cost: null },
  ];
  assert.equal(resultProgressContextKey("wtg", "wtg-1"), resultProgressContextKey("wtg", "WTG-1"));
  assert.deepEqual(progressForResult(entries, "wtg", "wtg-1").map(({ statusId }) => statusId), ["one"]);
});

test("rejects incomplete contexts and invalid stage data", () => {
  assert.throws(() => parseResultStatusProgress([{ resultType: "wtg", resultNumber: "", statusId: "one", completedAt: "2026-08-09T09:00:00.000Z", cost: null }]));
  assert.throws(() => parseResultStatusProgress([{ resultType: "unknown", resultNumber: "1", statusId: "one", completedAt: "2026-08-09T09:00:00.000Z", cost: null }]));
});
