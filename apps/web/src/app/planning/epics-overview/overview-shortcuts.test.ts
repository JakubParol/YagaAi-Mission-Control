import assert from "node:assert/strict";
import test from "node:test";

import { getAdjacentEpicKey } from "./page.js";

test("getAdjacentEpicKey returns first key when nothing selected", () => {
  const result = getAdjacentEpicKey(["MC-1", "MC-2", "MC-3"], null, 1);
  assert.equal(result, "MC-1");
});

test("getAdjacentEpicKey moves forward and clamps at list end", () => {
  const keys = ["MC-1", "MC-2", "MC-3"];
  assert.equal(getAdjacentEpicKey(keys, "MC-1", 1), "MC-2");
  assert.equal(getAdjacentEpicKey(keys, "MC-3", 1), "MC-3");
});

test("getAdjacentEpicKey moves backward and clamps at list start", () => {
  const keys = ["MC-1", "MC-2", "MC-3"];
  assert.equal(getAdjacentEpicKey(keys, "MC-3", -1), "MC-2");
  assert.equal(getAdjacentEpicKey(keys, "MC-1", -1), "MC-1");
});

test("getAdjacentEpicKey falls back to first key for unknown selection", () => {
  const result = getAdjacentEpicKey(["MC-1", "MC-2"], "MC-9", 1);
  assert.equal(result, "MC-1");
});
