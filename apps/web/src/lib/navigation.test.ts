import assert from "node:assert/strict";
import test from "node:test";

import { navModules } from "./navigation.js";

test("planning sub-pages include all views in correct order", () => {
  const planning = navModules.find((module) => module.href === "/planning");
  assert.ok(planning);

  const subPageHrefs = planning.subPages?.map((page) => page.href);
  assert.deepEqual(subPageHrefs, [
    "/planning/board",
    "/planning/backlog",
    "/planning/list",
    "/planning/epics-overview",
    "/planning/settings",
  ]);
});

test("control-plane sub-pages include dashboard and timeline", () => {
  const controlPlane = navModules.find((module) => module.href === "/control-plane");
  assert.ok(controlPlane);

  const subPageHrefs = controlPlane.subPages?.map((page) => page.href);
  assert.deepEqual(subPageHrefs, [
    "/control-plane/dashboard",
    "/control-plane/timeline",
  ]);
});

test("tests module exists with test1 as its only sub-page", () => {
  const tests = navModules.find((module) => module.href === "/tests");
  assert.ok(tests);
  assert.equal(tests.label, "Tests");

  assert.deepEqual(tests.subPages, [{ href: "/tests/test1", label: "Test1" }]);
});
