import assert from "node:assert/strict";
import test from "node:test";
import { areaUnit, documentDateForDisplay, normalizeDocumentDate } from "../src/lib/localized-values.ts";

test("normalizes legacy timestamps and calendar dates to a date-only value", () => {
  assert.equal(normalizeDocumentDate("2026-05-02T12:56:00"), "2026-05-02");
  assert.equal(normalizeDocumentDate("02.05.2026"), "2026-05-02");
  assert.equal(normalizeDocumentDate(""), "");
  assert.equal(documentDateForDisplay("2026-05-02")?.getFullYear(), 2026);
});

test("uses the Ukrainian hectare abbreviation only for Ukrainian locale", () => {
  assert.equal(areaUnit("uk"), "га");
  assert.equal(areaUnit("uk-UA"), "га");
  assert.equal(areaUnit("en"), "ha");
  assert.equal(areaUnit("de"), "ha");
});
