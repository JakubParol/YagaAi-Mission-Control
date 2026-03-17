/**
 * API call helpers for the story detail dialog.
 * All fetch/mutation logic lives here to keep the UI components pure.
 */

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus, StoryDetail, StoryLabel, TaskItem } from "@/lib/planning/types";
import type { TaskPatch } from "./task-optimistic";
import {
  mapStoryLabelsFromUnknown,
  mapTaskFromApi,
  normalizeStoryDraftForSave,
  parseApiMessage,
  parseNumberOrNull,
  type BacklogOption,
  type StoryDraft,
  type TaskDraft,
} from "./story-detail-view-model";

// ── Story fetching ──────────────────────────────────────────────────────────

export interface FetchStoryResult {
  story: StoryDetail;
  tasks: TaskItem[];
  labels: StoryLabel[];
  labelIds: string[];
}

export async function fetchStoryAndTasks(storyId: string): Promise<FetchStoryResult> {
  const [storyJson, tasksJson] = await Promise.all([
    fetch(apiUrl(`/v1/planning/stories/${storyId}`)).then((res) => {
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    }),
    fetch(apiUrl(`/v1/planning/tasks?story_id=${storyId}&sort=priority`)).then((res) => {
      if (!res.ok) throw new Error(`Tasks API error: ${res.status}`);
      return res.json();
    }),
  ]);

  const rawStory = storyJson.data as StoryDetail & {
    labels?: unknown;
    label_ids?: unknown;
  };
  const labels = mapStoryLabelsFromUnknown(rawStory.labels);
  const labelIds = Array.isArray(rawStory.label_ids)
    ? rawStory.label_ids.filter((value): value is string => typeof value === "string")
    : labels.map((label) => label.id);
  const story: StoryDetail = { ...rawStory, labels, label_ids: labelIds };
  const tasks = ((tasksJson.data ?? []) as Record<string, unknown>[]).map(mapTaskFromApi);

  return { story, tasks, labels, labelIds };
}

// ── Label fetching ──────────────────────────────────────────────────────────

export async function fetchStoryLabelsFromBacklogs(
  storyId: string,
  projectId: string,
): Promise<{ found: boolean; labels: StoryLabel[] }> {
  const backlogsResponse = await fetch(
    apiUrl(`/v1/planning/backlogs?project_id=${projectId}&limit=100`),
  );
  if (!backlogsResponse.ok) {
    throw new Error(await parseApiMessage(backlogsResponse));
  }

  const backlogsJson = (await backlogsResponse.json()) as {
    data?: BacklogOption[];
  };
  const backlogs = backlogsJson.data ?? [];
  if (backlogs.length === 0) return { found: false, labels: [] };

  const sections = await Promise.all(
    backlogs.map(async (backlog) => {
      const response = await fetch(apiUrl(`/v1/planning/backlogs/${backlog.id}/stories`));
      if (!response.ok) return null;
      const json = (await response.json()) as {
        data?: Array<{ id?: unknown; labels?: unknown }>;
      };
      const stories = json.data ?? [];
      const story = stories.find((item) => item.id === storyId);
      if (!story) return null;
      return { found: true, labels: mapStoryLabelsFromUnknown(story.labels) };
    }),
  );

  return sections.find((result) => result !== null) ?? { found: false, labels: [] };
}

export async function fetchAvailableLabels(projectId: string): Promise<StoryLabel[]> {
  const response = await fetch(
    apiUrl(`/v1/planning/labels?project_id=${projectId}&limit=100`),
  );
  if (!response.ok) throw new Error(await parseApiMessage(response));
  const json = await response.json();
  return mapStoryLabelsFromUnknown(json.data);
}

// ── Story mutations ─────────────────────────────────────────────────────────

export async function patchStoryFields(
  storyId: string,
  draft: StoryDraft,
): Promise<StoryDetail> {
  const normalized = normalizeStoryDraftForSave(draft);
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: normalized.title,
      story_type: normalized.story_type,
      description: normalized.description,
      intent: normalized.intent,
      priority: normalized.priority,
      epic_id: normalized.epic_id,
      is_blocked: normalized.blocked_reason !== null,
      blocked_reason: normalized.blocked_reason,
    }),
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
  const json = await response.json();
  return json.data as StoryDetail;
}

export async function patchStoryStatus(
  storyId: string,
  status: ItemStatus,
): Promise<StoryDetail> {
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
  const json = await response.json();
  return json.data as StoryDetail;
}

// ── Task mutations ──────────────────────────────────────────────────────────

export async function createTaskApi(
  projectId: string,
  storyId: string,
  draft: TaskDraft,
): Promise<TaskItem> {
  const response = await fetch(apiUrl("/v1/planning/tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      story_id: storyId,
      title: draft.title.trim(),
      objective: draft.objective.trim() === "" ? null : draft.objective.trim(),
      task_type: draft.task_type.trim() === "" ? "TASK" : draft.task_type.trim(),
      priority: parseNumberOrNull(draft.priority),
      estimate_points: parseNumberOrNull(draft.estimate_points),
      due_at: draft.due_at.trim() === "" ? null : draft.due_at.trim(),
    }),
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
  const json = await response.json();
  return mapTaskFromApi(json.data as Record<string, unknown>);
}

export async function patchTaskApi(taskId: string, patch: TaskPatch): Promise<TaskItem> {
  const apiPatch = { ...patch } as Record<string, unknown>;
  delete apiPatch.current_assignee_agent_id;

  const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(apiPatch),
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
  const json = await response.json();
  return mapTaskFromApi(json.data as Record<string, unknown>);
}

export async function deleteTaskApi(taskId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/tasks/${taskId}`), {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
}

// ── Label mutations ─────────────────────────────────────────────────────────

export async function attachLabelApi(storyId: string, labelId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}/labels`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label_id: labelId }),
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
}

export async function detachLabelApi(storyId: string, labelId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}/labels/${labelId}`), {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await parseApiMessage(response));
}

// ── Epic fetching ───────────────────────────────────────────────────────────

export interface FetchEpicsResult {
  id: string;
  key: string | null;
  title: string;
}

export async function fetchEpics(projectId: string): Promise<FetchEpicsResult[]> {
  const response = await fetch(
    apiUrl(`/v1/planning/epics?project_id=${projectId}&limit=100&sort=priority`),
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  return (json.data ?? []) as FetchEpicsResult[];
}
