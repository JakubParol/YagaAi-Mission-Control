import assert from "node:assert/strict";
import test from "node:test";

import type { ActivityEvent, DashboardAlert } from "./dashboard-types.js";
import {
  filterActivityByAgent,
  formatRelativeTime,
  sortAlertsBySeverity,
} from "./dashboard-view-model.js";

/* ------------------------------------------------------------------ */
/*  formatRelativeTime                                                */
/* ------------------------------------------------------------------ */

test("formatRelativeTime returns 'just now' for timestamps < 1 minute ago", () => {
  const now = new Date().toISOString();
  assert.equal(formatRelativeTime(now), "just now");
});

test("formatRelativeTime returns minutes for timestamps < 1 hour ago", () => {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
  assert.equal(formatRelativeTime(thirtyMinAgo), "30m ago");
});

test("formatRelativeTime returns hours for timestamps < 24 hours ago", () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
  assert.equal(formatRelativeTime(threeHoursAgo), "3h ago");
});

test("formatRelativeTime returns days for timestamps >= 24 hours ago", () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString();
  assert.equal(formatRelativeTime(twoDaysAgo), "2d ago");
});

test("formatRelativeTime handles future timestamps gracefully", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(formatRelativeTime(future), "just now");
});

/* ------------------------------------------------------------------ */
/*  filterActivityByAgent                                             */
/* ------------------------------------------------------------------ */

const EVENTS: ActivityEvent[] = [
  {
    id: "e1",
    timestamp: new Date().toISOString(),
    agentId: "agent-a",
    agentName: "A",
    agentInitials: "AA",
    eventType: "agent.task.completed",
    description: "d1",
    storyKey: "MC-1",
  },
  {
    id: "e2",
    timestamp: new Date().toISOString(),
    agentId: "agent-b",
    agentName: "B",
    agentInitials: "BB",
    eventType: "agent.task.started",
    description: "d2",
    storyKey: "MC-2",
  },
];

test("filterActivityByAgent returns all events when agentId is null", () => {
  assert.equal(filterActivityByAgent(EVENTS, null).length, 2);
});

test("filterActivityByAgent filters to specific agent", () => {
  const result = filterActivityByAgent(EVENTS, "agent-a");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "e1");
});

test("filterActivityByAgent returns empty for unknown agent", () => {
  assert.equal(filterActivityByAgent(EVENTS, "agent-z").length, 0);
});

/* ------------------------------------------------------------------ */
/*  sortAlertsBySeverity                                              */
/* ------------------------------------------------------------------ */

const ALERTS: DashboardAlert[] = [
  {
    id: "a1",
    severity: "warning",
    title: "W1",
    description: "d",
    agentId: null,
    storyKey: null,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "a2",
    severity: "error",
    title: "E1",
    description: "d",
    agentId: null,
    storyKey: null,
    timestamp: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: "a3",
    severity: "error",
    title: "E2",
    description: "d",
    agentId: null,
    storyKey: null,
    timestamp: new Date().toISOString(),
  },
];

test("sortAlertsBySeverity puts errors before warnings", () => {
  const sorted = sortAlertsBySeverity(ALERTS);
  assert.equal(sorted[0].severity, "error");
  assert.equal(sorted[1].severity, "error");
  assert.equal(sorted[2].severity, "warning");
});

test("sortAlertsBySeverity sorts same-severity by newest first", () => {
  const sorted = sortAlertsBySeverity(ALERTS);
  assert.equal(sorted[0].id, "a3");
  assert.equal(sorted[1].id, "a2");
});

test("sortAlertsBySeverity does not mutate original array", () => {
  const original = [...ALERTS];
  sortAlertsBySeverity(ALERTS);
  assert.deepEqual(ALERTS, original);
});
