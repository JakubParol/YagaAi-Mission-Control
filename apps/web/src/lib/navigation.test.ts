import assert from "node:assert/strict";
import test from "node:test";

import { navModules } from "./navigation.js";

test("planning sub-pages include List between Backlog and Settings", () => {
  const planning = navModules.find((module) => module.href === "/planning");
  assert.ok(planning);

  const subPageHrefs = planning.subPages?.map((page) => page.href);
  assert.deepEqual(subPageHrefs, [
    "/planning/board",
    "/planning/backlog",
    "/planning/list",
    "/planning/settings",
  ]);
});
