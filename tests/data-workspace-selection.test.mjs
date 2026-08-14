import test from "node:test";
import assert from "node:assert/strict";
import { resolveDataWorkspace } from "../src/lib/data-workspace-selection.ts";

test("defaults a user without a preference to the test database when it is enabled", () => {
  assert.equal(resolveDataWorkspace(true, null), "sandbox");
});

test("restores either explicit personal database choice", () => {
  assert.equal(resolveDataWorkspace(true, "sandbox"), "sandbox");
  assert.equal(resolveDataWorkspace(true, "production"), "production");
});

test("forces the production database while the test database is disabled", () => {
  assert.equal(resolveDataWorkspace(false, null), "production");
  assert.equal(resolveDataWorkspace(false, "sandbox"), "production");
  assert.equal(resolveDataWorkspace(false, "production"), "production");
});
