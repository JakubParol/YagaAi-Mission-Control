/**
 * Pure view-model helpers for the backlog page.
 * No React, no side effects — easy to test.
 */

import type { BacklogItem, PlanningAgentApiItem } from "./backlog-types";

export function isCompleteSprintTarget(
  backlog: BacklogItem,
  sourceBacklogId: string,
): boolean {
  if (backlog.id === sourceBacklogId) return false;
  if (backlog.kind !== "SPRINT" && backlog.kind !== "BACKLOG") return false;
  const status = String(backlog.status);
  return status === "OPEN" || status === "ACTIVE";
}

export function resolveAgentLabel(agent: PlanningAgentApiItem): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

export function getPluralizedWorkItems(count: number): string {
  return count === 1 ? "work item" : "work items";
}

export async function parseApiMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    const message = body.error?.message;
    if (message && message.trim().length > 0) return message;
  } catch {
    // Ignore parse failures and use fallback text.
  }
  return `${fallback} HTTP ${response.status}.`;
}
