import assert from "node:assert/strict";
import test from "node:test";

import { excludeClosedSprintBacklogs } from "./backlog-filters.js";

test("excludeClosedSprintBacklogs removes CLOSED sprint sections only", () => {
  const backlogs = [
    { id: "s-active", kind: "SPRINT", status: "ACTIVE" },
    { id: "s-closed", kind: "SPRINT", status: "CLOSED" },
    { id: "product", kind: "BACKLOG", status: "ACTIVE" },
    { id: "ideas", kind: "IDEAS", status: "ACTIVE" },
  ] as const;

  const visible = excludeClosedSprintBacklogs(backlogs);

  assert.deepEqual(
    visible.map((item) => item.id),
    ["s-active", "product", "ideas"],
  );
});
