/**
 * Backlog page API calls.
 * All fetch/mutation operations for the backlog page live here.
 */

import { apiUrl } from "@/lib/api-client";
import type { WorkItemStatus } from "@/lib/planning/types";
import type { PlanningFilterOption } from "@/components/planning/planning-filters";
import type { StoryCardStory } from "@/components/planning/story-card";
import {
  removeStoryFromActiveSprint,
} from "../sprint-membership-actions";
import { excludeClosedSprintBacklogs, sortBacklogsForPlanning } from "./backlog-filters";
import type {
  BacklogItem,
  BacklogWithItems,
  FetchResult,
  PlanningAgentApiItem,
} from "./backlog-types";
import { resolveAgentLabel } from "./backlog-view-model";
import { addStoryToBacklog, removeStoryFromBacklog } from "./board-actions";

interface BacklogWithItemsApiResponse extends BacklogItem {
  items?: StoryCardStory[];
}

function normalizeItems(rawItems: StoryCardStory[]): StoryCardStory[] {
  return rawItems.map((item) => ({
    ...item,
    children_count: item.children_count ?? 0,
    done_children_count: item.done_children_count ?? 0,
    labels: item.labels ?? [],
    label_ids: item.label_ids ?? [],
    parent_key: item.parent_key ?? null,
    parent_title: item.parent_title ?? null,
    assignee_agent_id: item.assignee_agent_id ?? item.current_assignee_agent_id ?? null,
  }));
}

async function fetchItemsForBacklog(backlogId: string): Promise<StoryCardStory[]> {
  const res = await fetch(apiUrl(`/v1/planning/backlogs/${backlogId}/items`));
  if (!res.ok) return [];
  const body = await res.json();
  return normalizeItems((body.data ?? []) as StoryCardStory[]);
}

export async function fetchBacklogData(projectId: string): Promise<FetchResult> {
  const [backlogsResponse, agentsResponse] = await Promise.all([
    fetch(apiUrl(`/v1/planning/backlogs?project_id=${projectId}&limit=100&include=items`)),
    fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name")).catch(() => null),
  ]);

  if (!backlogsResponse.ok) {
    throw new Error(`API error: ${backlogsResponse.status}`);
  }

  const json = await backlogsResponse.json();
  const rawBacklogs: BacklogWithItemsApiResponse[] = sortBacklogsForPlanning(
    excludeClosedSprintBacklogs(json.data ?? []),
  );

  if (rawBacklogs.length === 0) {
    return { kind: "empty" };
  }

  const itemsEmbedded = rawBacklogs.length > 0 && Array.isArray(rawBacklogs[0].items);

  let sections: BacklogWithItems[];
  if (itemsEmbedded) {
    sections = rawBacklogs.map((backlog) => ({
      backlog,
      items: normalizeItems((backlog.items ?? []) as StoryCardStory[]),
    }));
  } else {
    sections = await Promise.all(
      rawBacklogs.map(async (backlog) => ({
        backlog,
        items: await fetchItemsForBacklog(backlog.id),
      })),
    );
  }

  const agents: PlanningAgentApiItem[] = agentsResponse?.ok
    ? ((await agentsResponse.json()) as { data?: PlanningAgentApiItem[] }).data ?? []
    : [];

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

export async function patchStoryAssignee(
  storyId: string,
  nextAssigneeAgentId: string | null,
): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/work-items/${storyId}`), {
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
  rankA: string,
  rankB: string,
): Promise<void> {
  await Promise.all([
    fetch(apiUrl(`/v1/planning/backlogs/${boardAId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rank: rankB }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Failed to reorder board. HTTP ${res.status}.`);
    }),
    fetch(apiUrl(`/v1/planning/backlogs/${boardBId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rank: rankA }),
    }).then((res) => {
      if (!res.ok) throw new Error(`Failed to reorder board. HTTP ${res.status}.`);
    }),
  ]);
}

/**
 * Move open stories from a completing sprint to the target board,
 * then return. Caller is responsible for the actual completeSprint call.
 */
export async function moveOpenStoriesToTarget(
  projectId: string,
  sourceBacklogId: string,
  targetBacklogId: string,
  defaultBacklogId: string,
  openStories: readonly StoryCardStory[],
): Promise<void> {
  for (const story of openStories) {
    if (targetBacklogId === defaultBacklogId) {
      await removeStoryFromActiveSprint(projectId, story.id);
      continue;
    }
    await removeStoryFromBacklog(sourceBacklogId, story.id);
    try {
      await addStoryToBacklog(targetBacklogId, story.id);
    } catch (error) {
      try {
        await addStoryToBacklog(sourceBacklogId, story.id);
      } catch {
        /* rollback failure; original error is more actionable */
      }
      throw error;
    }
  }
}
