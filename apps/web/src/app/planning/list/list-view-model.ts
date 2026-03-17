import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";
import type { StoryCardStory } from "@/components/planning/story-card";
import type { WorkItemStatus } from "@/lib/planning/types";

import type { PlanningAgentApiItem } from "./list-types";

export const COMING_SOON_LABEL = "Coming soon";

export interface PlanningListLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface PlanningStoryApiItem {
  id: string;
  epic_id: string | null;
  current_assignee_agent_id: string | null;
  key: string | null;
  title: string;
  story_type: string;
  status: WorkItemStatus;
  priority: number | null;
  updated_at: string;
}

export interface PlanningBacklogStoryApiItem {
  id: string;
  key: string | null;
  title: string;
  story_type: string;
  status: WorkItemStatus;
  priority: number | null;
  epic_key: string | null;
  epic_title: string | null;
  task_count?: number;
  done_task_count?: number;
  labels: PlanningListLabel[];
}

export interface PlanningTaskApiItem {
  id: string;
  story_id: string | null;
  current_assignee_agent_id: string | null;
  key: string | null;
  title: string;
  objective: string | null;
  task_type: string;
  status: WorkItemStatus;
  priority: number | null;
  updated_at: string;
}

export interface PlanningEpicApiItem {
  id: string;
  key: string;
  title: string;
}

export interface PlanningListRow {
  row_type: "story" | "task";
  id: string;
  key: string | null;
  title: string;
  status: WorkItemStatus;
  priority: number | null;
  epic_id: string | null;
  epic_key: string | null;
  epic_title: string | null;
  labels: PlanningListLabel[];
  current_assignee_agent_id: string | null;
  updated_at: string;
  story_type: string | null;
  task_type: string | null;
  objective: string | null;
  task_count: number;
  done_task_count: number;
}

function asTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function toStoryRows(
  stories: PlanningStoryApiItem[],
  backlogStories: PlanningBacklogStoryApiItem[],
  allTasks: PlanningTaskApiItem[],
  epics: PlanningEpicApiItem[],
): PlanningListRow[] {
  const backlogById = new Map(backlogStories.map((story) => [story.id, story]));
  const epicById = new Map(epics.map((epic) => [epic.id, epic]));
  const progressByStoryId = new Map<string, { total: number; done: number }>();

  for (const task of allTasks) {
    if (!task.story_id) continue;
    const current = progressByStoryId.get(task.story_id) ?? { total: 0, done: 0 };
    current.total += 1;
    if (task.status === "DONE") {
      current.done += 1;
    }
    progressByStoryId.set(task.story_id, current);
  }

  return stories.map((story) => {
    const backlogStory = backlogById.get(story.id);
    const epic = story.epic_id ? epicById.get(story.epic_id) : undefined;
    const progress = progressByStoryId.get(story.id);
    const taskCount = backlogStory?.task_count ?? progress?.total ?? 0;
    const doneTaskCount = backlogStory?.done_task_count ?? progress?.done ?? 0;

    return {
      row_type: "story",
      id: story.id,
      key: story.key,
      title: story.title,
      status: story.status,
      priority: story.priority,
      epic_id: story.epic_id,
      epic_key: backlogStory?.epic_key ?? epic?.key ?? null,
      epic_title: backlogStory?.epic_title ?? epic?.title ?? null,
      labels: backlogStory?.labels ?? [],
      current_assignee_agent_id: story.current_assignee_agent_id,
      updated_at: story.updated_at,
      story_type: story.story_type,
      task_type: null,
      objective: null,
      task_count: taskCount,
      done_task_count: doneTaskCount,
    };
  });
}

function toStandaloneTaskRows(tasks: PlanningTaskApiItem[]): PlanningListRow[] {
  return tasks
    .filter((task) => task.story_id === null)
    .map((task) => ({
      row_type: "task",
      id: task.id,
      key: task.key,
      title: task.title,
      status: task.status,
      priority: task.priority,
      epic_id: null,
      epic_key: null,
      epic_title: null,
      labels: [],
      current_assignee_agent_id: task.current_assignee_agent_id,
      updated_at: task.updated_at,
      story_type: null,
      task_type: task.task_type,
      objective: task.objective,
      task_count: 0,
      done_task_count: 0,
    }));
}

export function buildPlanningListRows(input: {
  stories: PlanningStoryApiItem[];
  backlogStories: PlanningBacklogStoryApiItem[];
  standaloneTaskCandidates: PlanningTaskApiItem[];
  epics: PlanningEpicApiItem[];
}): PlanningListRow[] {
  const storyRows = toStoryRows(
    input.stories,
    input.backlogStories,
    input.standaloneTaskCandidates,
    input.epics,
  );
  const standaloneTaskRows = toStandaloneTaskRows(input.standaloneTaskCandidates);

  return [...storyRows, ...standaloneTaskRows].sort((a, b) => {
    const tsDiff = asTimestamp(b.updated_at) - asTimestamp(a.updated_at);
    if (tsDiff !== 0) return tsDiff;
    return (a.key ?? a.id).localeCompare(b.key ?? b.id);
  });
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getPriorityLabel(priority: number | null): string {
  return priority === null ? "—" : String(priority);
}

export function resolveAgentLabel(agent: PlanningAgentApiItem): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

export function buildLabelOptions(rows: PlanningListRow[]): PlanningListLabel[] {
  const labelsById = new Map<string, PlanningListLabel>();

  for (const row of rows) {
    for (const label of row.labels) {
      if (!labelsById.has(label.id)) {
        labelsById.set(label.id, label);
      }
    }
  }

  return [...labelsById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function toBacklogRowStory(
  row: PlanningListRow,
  assigneeById: ReadonlyMap<string, BacklogAssigneeOption>,
): StoryCardStory {
  const selectedAssignee =
    row.current_assignee_agent_id ? assigneeById.get(row.current_assignee_agent_id) : null;

  return {
    id: row.id,
    key: row.key,
    title: row.title,
    status: row.status,
    priority: row.priority,
    story_type: row.story_type ?? row.task_type ?? "TASK",
    epic_key: row.epic_key,
    epic_title: row.epic_title,
    position: 0,
    task_count: row.task_count,
    done_task_count: row.done_task_count,
    labels: row.labels,
    assignee_agent_id: row.current_assignee_agent_id,
    current_assignee_agent_id: row.current_assignee_agent_id,
    assignee_name: selectedAssignee?.name ?? null,
    assignee_last_name: selectedAssignee?.last_name ?? null,
    assignee_initials: selectedAssignee?.initials ?? null,
    assignee_avatar: selectedAssignee?.avatar ?? null,
  };
}
