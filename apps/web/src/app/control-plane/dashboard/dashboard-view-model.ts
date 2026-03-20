/* ------------------------------------------------------------------ */
/*  MC-553 — Pure helpers for the Control Plane Dashboard             */
/* ------------------------------------------------------------------ */

import type { ActivityEvent, DashboardAlert } from "./dashboard-types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  return `${days}d ago`;
}

export function filterActivityByAgent(
  events: ActivityEvent[],
  agentId: string | null,
): ActivityEvent[] {
  if (!agentId) return events;
  return events.filter((e) => e.agentId === agentId);
}

export function sortAlertsBySeverity(alerts: DashboardAlert[]): DashboardAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.severity === b.severity) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
    return a.severity === "error" ? -1 : 1;
  });
}
