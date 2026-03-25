import assert from "node:assert/strict";
import test from "node:test";

import { navModules } from "./navigation.js";

test("planning sub-pages include all views in correct order", () => {
  const planning = navModules.find((module) => module.href === "/planning");
  assert.ok(planning);

  assert.deepEqual(planning.subPages, [
    { href: "/planning/board", label: "Board" },
    { href: "/planning/backlog", label: "Backlog" },
    { href: "/planning/list", label: "List" },
    { href: "/planning/epics-overview", label: "Epics" },
    { href: "/planning/settings", label: "Settings" },
  ]);
});

test("control-plane sub-pages include dashboard and timeline", () => {
  const controlPlane = navModules.find((module) => module.href === "/control-plane");
  assert.ok(controlPlane);

  assert.deepEqual(controlPlane.subPages, [
    { href: "/control-plane/dashboard", label: "Dashboard" },
    { href: "/control-plane/timeline", label: "Timeline" },
  ]);
});

test("tests module exists with test1 as its only sub-page", () => {
  const tests = navModules.find((module) => module.href === "/tests");
  assert.ok(tests);
  assert.equal(tests.label, "Tests");

  assert.deepEqual(tests.subPages, [{ href: "/tests/test1", label: "Test1" }]);
});
