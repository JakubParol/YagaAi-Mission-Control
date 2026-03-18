import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";
import { apiUrl } from "@/lib/api-client";
import type { WorkItemStatus } from "@/lib/planning/types";

import {
  buildLabelOptions,
  buildPlanningListRows,
  resolveAgentLabel,
  type PlanningBacklogStoryApiItem,
  type PlanningEpicApiItem,
  type PlanningListLabel,
  type PlanningStoryApiItem,
  type PlanningTaskApiItem,
} from "./list-view-model";
import type {
  FetchResult,
  PlanningAgentApiItem,
  PlanningBacklogApiItem,
  PlanningListAssigneeOption,
} from "./list-types";

interface ListEnvelope<T> {
  data?: T[];
}

export async function fetchList<T>(path: string): Promise<T[]> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`Failed to load list data (${response.status})`);
  }
  const body = (await response.json()) as ListEnvelope<T>;
  return body.data ?? [];
}

export async function fetchListResult(projectId: string): Promise<FetchResult> {
  const [stories, tasks, epics, backlogs, agents] = await Promise.all([
    fetchList<PlanningStoryApiItem>(
      `/v1/planning/work-items?type=STORY&project_id=${projectId}&limit=100&sort=-updated_at`,
    ),
    fetchList<PlanningTaskApiItem>(
      `/v1/planning/work-items?type=TASK&project_id=${projectId}&limit=100&sort=-updated_at`,
    ),
    fetchList<PlanningEpicApiItem>(
      `/v1/planning/work-items?type=EPIC&project_id=${projectId}&limit=100`,
    ),
    fetchList<PlanningBacklogApiItem>(
      `/v1/planning/backlogs?project_id=${projectId}&limit=100`,
    ),
    fetchList<PlanningAgentApiItem>(
      "/v1/planning/agents?is_active=true&limit=100&sort=name",
    ).catch(() => []),
  ]);

  const backlogStoryGroups = await Promise.all(
    backlogs.map((backlog) =>
      fetchList<PlanningBacklogStoryApiItem>(
        `/v1/planning/backlogs/${backlog.id}/items`,
      ).catch(() => []),
    ),
  );

  const backlogStoryById = new Map<string, PlanningBacklogStoryApiItem>();
  for (const group of backlogStoryGroups) {
    for (const story of group) {
      if (!backlogStoryById.has(story.id)) {
        backlogStoryById.set(story.id, story);
      }
    }
  }

  const rows = buildPlanningListRows({
    stories,
    backlogStories: [...backlogStoryById.values()],
    standaloneTaskCandidates: tasks,
    epics,
  });

  if (rows.length === 0) {
    return { kind: "empty" };
  }

  const labels: PlanningListLabel[] = buildLabelOptions(rows);
  const assignees: PlanningListAssigneeOption[] = agents
    .map((agent) => {
      const agentLabel = resolveAgentLabel(agent);
      return agentLabel && agent.id ? { id: agent.id, label: agentLabel } : null;
    })
    .filter((value): value is PlanningListAssigneeOption => value !== null)
    .sort((a, b) => a.label.localeCompare(b.label));

  const assignableAgents: BacklogAssigneeOption[] = agents
    .filter((agent): agent is PlanningAgentApiItem & { id: string; name: string } => (
      typeof agent.id === "string"
      && agent.id.trim().length > 0
      && typeof agent.name === "string"
      && agent.name.trim().length > 0
    ))
    .map((agent) => ({
      id: String(agent.id),
      name: String(agent.name),
      last_name: agent.last_name ?? null,
      initials: agent.initials ?? null,
      role: agent.role ?? null,
      avatar: agent.avatar ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    kind: "ok",
    rows,
    epics,
    labels,
    assignees,
    assignableAgents,
  };
}

export async function patchStoryStatus(
  storyId: string,
  status: WorkItemStatus,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/work-items/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update story status. HTTP ${response.status}.`);
  }
}

export async function patchRowAssignee(
  _rowType: "story" | "task",
  rowId: string,
  assigneeId: string | null,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/work-items/${rowId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_assignee_agent_id: assigneeId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update assignee. HTTP ${response.status}.`);
  }
}
