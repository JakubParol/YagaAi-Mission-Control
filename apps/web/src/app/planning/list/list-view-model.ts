import type { BacklogAssigneeOption } from "@/components/planning/backlog-row";
import type { StoryCardStory } from "@/components/planning/story-card";
import type { WorkItemStatus } from "@/lib/planning/types";

import type { PlanningAgentApiItem } from "./list-types";

export interface PlanningListLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface PlanningStoryApiItem {
  id: string;
  parent_id: string | null;
  current_assignee_agent_id: string | null;
  key: string | null;
  title: string;
  sub_type: string;
  status: WorkItemStatus;
  priority: number | null;
  updated_at: string;
  parent_key: string | null;
  parent_title: string | null;
  children_count: number;
  done_children_count: number;
  labels: PlanningListLabel[];
}

export interface PlanningTaskApiItem {
  id: string;
  parent_id: string | null;
  current_assignee_agent_id: string | null;
  key: string | null;
  title: string;
  summary: string | null;
  sub_type: string;
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
  parent_id: string | null;
  parent_key: string | null;
  parent_title: string | null;
  labels: PlanningListLabel[];
  current_assignee_agent_id: string | null;
  updated_at: string;
  type: string;
  sub_type: string | null;
  summary: string | null;
  children_count: number;
  done_children_count: number;
}

function asTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function toStoryRows(
  stories: PlanningStoryApiItem[],
): PlanningListRow[] {
  return stories.map((story) => ({
    row_type: "story",
    id: story.id,
    key: story.key,
    title: story.title,
    status: story.status,
    priority: story.priority,
    parent_id: story.parent_id,
    parent_key: story.parent_key,
    parent_title: story.parent_title,
    labels: story.labels ?? [],
    current_assignee_agent_id: story.current_assignee_agent_id,
    updated_at: story.updated_at,
    type: "STORY",
    sub_type: story.sub_type,
    summary: null,
    children_count: story.children_count,
    done_children_count: story.done_children_count,
  }));
}

function toStandaloneTaskRows(tasks: PlanningTaskApiItem[]): PlanningListRow[] {
  return tasks
    .filter((task) => task.parent_id === null)
    .map((task) => ({
      row_type: "task",
      id: task.id,
      key: task.key,
      title: task.title,
      status: task.status,
      priority: task.priority,
      parent_id: null,
      parent_key: null,
      parent_title: null,
      labels: [],
      current_assignee_agent_id: task.current_assignee_agent_id,
      updated_at: task.updated_at,
      type: "TASK",
      sub_type: task.sub_type,
      summary: task.summary,
      children_count: 0,
      done_children_count: 0,
    }));
}

export function buildPlanningListRows(input: {
  stories: PlanningStoryApiItem[];
  standaloneTaskCandidates: PlanningTaskApiItem[];
}): PlanningListRow[] {
  const storyRows = toStoryRows(input.stories);
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
    type: row.type,
    sub_type: row.sub_type,
    parent_key: row.parent_key,
    parent_title: row.parent_title,
    rank: "",
    children_count: row.children_count,
    done_children_count: row.done_children_count,
    labels: row.labels,
    assignee_agent_id: row.current_assignee_agent_id,
    current_assignee_agent_id: row.current_assignee_agent_id,
    assignee_name: selectedAssignee?.name ?? null,
    assignee_last_name: selectedAssignee?.last_name ?? null,
    assignee_initials: selectedAssignee?.initials ?? null,
    assignee_avatar: selectedAssignee?.avatar ?? null,
  };
}
