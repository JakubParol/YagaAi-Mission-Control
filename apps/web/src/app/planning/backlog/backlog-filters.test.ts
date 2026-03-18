import assert from "node:assert/strict";
import test from "node:test";

import { excludeClosedSprintBacklogs, sortBacklogsForPlanning } from "./backlog-filters.js";

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

test("sortBacklogsForPlanning keeps active sprint first, default backlog last, middle by rank", () => {
  const backlogs = [
    {
      id: "default-backlog",
      kind: "BACKLOG",
      status: "ACTIVE",
      rank: "aaa",
      is_default: true,
      created_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "open-sprint",
      kind: "SPRINT",
      status: "OPEN",
      rank: "ccc",
      is_default: false,
      created_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "active-sprint",
      kind: "SPRINT",
      status: "ACTIVE",
      rank: "eee",
      is_default: false,
      created_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "ideas",
      kind: "IDEAS",
      status: "ACTIVE",
      rank: "aab",
      is_default: false,
      created_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "backlog-b",
      kind: "BACKLOG",
      status: "ACTIVE",
      rank: "bbb",
      is_default: false,
      created_at: "2026-03-01T00:00:00Z",
    },
  ] as const;

  const sorted = sortBacklogsForPlanning(backlogs);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["active-sprint", "ideas", "backlog-b", "open-sprint", "default-backlog"],
  );
});
