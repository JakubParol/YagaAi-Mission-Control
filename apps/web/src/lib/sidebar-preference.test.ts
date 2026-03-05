import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSidebarCollapsedPreference,
  serializeSidebarCollapsedPreference,
} from "./sidebar-preference.js";

test("parseSidebarCollapsedPreference returns true only for persisted true", () => {
  assert.equal(parseSidebarCollapsedPreference("true"), true);
  assert.equal(parseSidebarCollapsedPreference("false"), false);
  assert.equal(parseSidebarCollapsedPreference(null), false);
  assert.equal(parseSidebarCollapsedPreference("1"), false);
});

test("serializeSidebarCollapsedPreference serializes boolean to storage-safe values", () => {
  assert.equal(serializeSidebarCollapsedPreference(true), "true");
  assert.equal(serializeSidebarCollapsedPreference(false), "false");
});
