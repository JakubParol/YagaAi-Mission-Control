/**
 * Backlog page API calls.
 * All fetch/mutation operations for the backlog page live here.
 */

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import type { PlanningFilterOption } from "@/components/planning/planning-filters";
import { excludeClosedSprintBacklogs, sortBacklogsForPlanning } from "./backlog-filters";
import type {
  BacklogItem,
  BacklogWithStories,
  FetchResult,
  PlanningAgentApiItem,
} from "./backlog-types";
import { resolveAgentLabel } from "./backlog-view-model";

export async function fetchBacklogData(projectId: string): Promise<FetchResult> {
  const response = await fetch(
    apiUrl(`/v1/planning/backlogs?project_id=${projectId}&limit=100`),
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json = await response.json();
  const backlogs: BacklogItem[] = sortBacklogsForPlanning(
    excludeClosedSprintBacklogs(json.data ?? []),
  );

  if (backlogs.length === 0) {
    return { kind: "empty" };
  }

  const sections: BacklogWithStories[] = await Promise.all(
    backlogs.map(async (backlog) => {
      const storiesResponse = await fetch(apiUrl(`/v1/planning/backlogs/${backlog.id}/stories`));
      if (!storiesResponse.ok) return { backlog, stories: [] };
      const body = await storiesResponse.json();
      return { backlog, stories: body.data ?? [] };
    }),
  );

  const agents = await fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name"))
    .then(async (res) => {
      if (!res.ok) return [] as PlanningAgentApiItem[];
      const body = (await res.json()) as { data?: PlanningAgentApiItem[] };
      return body.data ?? [];
    })
    .catch(() => [] as PlanningAgentApiItem[]);

  const assignees = agents
    .map((agent) => {
      const label = resolveAgentLabel(agent);
      return label && agent.id ? { value: agent.id, label } : null;
    })
    .filter((item): item is PlanningFilterOption => item !== null)
    .sort((a, b) => a.label.localeCompare(b.label));

  const assignableAgentsResult = agents
    .filter((agent): agent is PlanningAgentApiItem & { id: string; name: string } => (
      typeof agent.id === "string"
      && agent.id.trim().length > 0
      && typeof agent.name === "string"
      && agent.name.trim().length > 0
    ))
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      last_name: agent.last_name ?? null,
      initials: agent.initials ?? null,
      role: agent.role ?? null,
      avatar: agent.avatar ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { kind: "ok", sections, assignees, assignableAgents: assignableAgentsResult };
}

export async function patchStoryStatus(
  storyId: string,
  status: ItemStatus,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update story status. HTTP ${response.status}.`);
  }
}

export async function patchStoryAssignee(
  storyId: string,
  nextAssigneeAgentId: string | null,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_assignee_agent_id: nextAssigneeAgentId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update assignee. HTTP ${response.status}.`);
  }
}

export async function swapBoardOrder(
  boardAId: string,
  boardBId: string,
  orderA: number,
  orderB: number,
): Promise<void> {
  await Promise.all([
    fetch(apiUrl(`/v1/planning/backlogs/${boardAId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_order: orderB }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Failed to reorder board. HTTP ${res.status}.`);
    }),
    fetch(apiUrl(`/v1/planning/backlogs/${boardBId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_order: orderA }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Failed to reorder board. HTTP ${res.status}.`);
    }),
  ]);
}
