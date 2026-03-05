import type { ItemStatus } from "@/lib/planning/types";

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
  status: ItemStatus;
  priority: number | null;
  updated_at: string;
}

export interface PlanningBacklogStoryApiItem {
  id: string;
  key: string | null;
  title: string;
  story_type: string;
  status: ItemStatus;
  priority: number | null;
  epic_key: string | null;
  epic_title: string | null;
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
  status: ItemStatus;
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
  status: ItemStatus;
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
}

function asTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function toStoryRows(
  stories: PlanningStoryApiItem[],
  backlogStories: PlanningBacklogStoryApiItem[],
  epics: PlanningEpicApiItem[],
): PlanningListRow[] {
  const backlogById = new Map(backlogStories.map((story) => [story.id, story]));
  const epicById = new Map(epics.map((epic) => [epic.id, epic]));

  return stories.map((story) => {
    const backlogStory = backlogById.get(story.id);
    const epic = story.epic_id ? epicById.get(story.epic_id) : undefined;

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
    }));
}

export function buildPlanningListRows(input: {
  stories: PlanningStoryApiItem[];
  backlogStories: PlanningBacklogStoryApiItem[];
  standaloneTaskCandidates: PlanningTaskApiItem[];
  epics: PlanningEpicApiItem[];
}): PlanningListRow[] {
  const storyRows = toStoryRows(input.stories, input.backlogStories, input.epics);
  const standaloneTaskRows = toStandaloneTaskRows(input.standaloneTaskCandidates);

  return [...storyRows, ...standaloneTaskRows].sort((a, b) => {
    const tsDiff = asTimestamp(b.updated_at) - asTimestamp(a.updated_at);
    if (tsDiff !== 0) return tsDiff;
    return (a.key ?? a.id).localeCompare(b.key ?? b.id);
  });
}
