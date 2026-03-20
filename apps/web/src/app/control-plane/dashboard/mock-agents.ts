/* ------------------------------------------------------------------ */
/*  MC-553 — Mock agent + queue fixtures for Control Plane Dashboard  */
/* ------------------------------------------------------------------ */

import type { AgentQueue, DashboardAgent } from "./dashboard-types";

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

export const MOCK_AGENTS: DashboardAgent[] = [
  {
    id: "agent-james",
    name: "James",
    role: "orchestrator",
    initials: "JH",
    state: "PLANNING",
    activeStory: { key: "MC-540", title: "Control Plane dispatch queue", done: 3, total: 5 },
    currentTask: "Design retry strategy",
    lastActivityAt: minutesAgo(4),
  },
  {
    id: "agent-naomi",
    name: "Naomi",
    role: "fullstack-dev",
    initials: "NN",
    state: "EXECUTING",
    activeStory: { key: "MC-537", title: "Board card styling polish", done: 4, total: 6 },
    currentTask: "Implement drag-drop reorder",
    lastActivityAt: minutesAgo(1),
  },
  {
    id: "agent-amos",
    name: "Amos",
    role: "qa",
    initials: "AM",
    state: "REVIEW_READY",
    activeStory: { key: "MC-535", title: "API contract tests for assignments", done: 5, total: 5 },
    currentTask: null,
    lastActivityAt: minutesAgo(18),
  },
  {
    id: "agent-alex",
    name: "Alex",
    role: "researcher",
    initials: "AR",
    state: "IDLE",
    activeStory: null,
    currentTask: null,
    lastActivityAt: hoursAgo(1.2),
  },
];

export const MOCK_QUEUES: AgentQueue[] = [
  {
    agentId: "agent-naomi",
    agentName: "Naomi",
    capacity: 1,
    stories: [
      { key: "MC-548", title: "Backlog drag-to-reorder", estimatedTasks: 4 },
      { key: "MC-551", title: "Settings page dark-mode toggle", estimatedTasks: 3 },
    ],
  },
  {
    agentId: "agent-amos",
    agentName: "Amos",
    capacity: 1,
    stories: [
      { key: "MC-549", title: "E2E smoke tests for board filters", estimatedTasks: 5 },
    ],
  },
  {
    agentId: "agent-james",
    agentName: "James",
    capacity: 1,
    stories: [
      { key: "MC-552", title: "Watchdog retry policy design", estimatedTasks: 3 },
      { key: "MC-554", title: "Agent capacity model v2", estimatedTasks: 6 },
      { key: "MC-556", title: "Dead-letter queue alerting", estimatedTasks: 4 },
    ],
  },
];
