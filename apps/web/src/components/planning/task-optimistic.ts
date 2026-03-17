import type { WorkItemStatus, TaskItemView } from "@/lib/planning/types";

export interface TaskDraftInput {
  storyId: string;
  title: string;
  summary: string | null;
  sub_type: string;
  priority: number | null;
  estimate_points: number | null;
  due_at: string | null;
}

export function createOptimisticTask(draft: TaskDraftInput, tempId: string): TaskItemView {
  return {
    id: tempId,
    key: null,
    title: draft.title,
    summary: draft.summary,
    sub_type: draft.sub_type,
    status: "TODO",
    priority: draft.priority,
    is_blocked: false,
    blocked_reason: null,
    estimate_points: draft.estimate_points,
    due_at: draft.due_at,
    current_assignee_agent_id: null,
  };
}

export function addOptimisticTask(tasks: TaskItemView[], task: TaskItemView): TaskItemView[] {
  return [task, ...tasks];
}

export function replaceTask(tasks: TaskItemView[], taskId: string, replacement: TaskItemView): TaskItemView[] {
  return tasks.map((task) => (task.id === taskId ? replacement : task));
}

export function removeTask(tasks: TaskItemView[], taskId: string): TaskItemView[] {
  return tasks.filter((task) => task.id !== taskId);
}

export type TaskPatch = Partial<
  Pick<
    TaskItemView,
    | "title"
    | "summary"
    | "sub_type"
    | "status"
    | "is_blocked"
    | "blocked_reason"
    | "priority"
    | "estimate_points"
    | "due_at"
    | "current_assignee_agent_id"
  >
>;

export interface ApplyTaskPatchResult {
  nextTasks: TaskItemView[];
  previousTask: TaskItemView | null;
}

export function applyOptimisticTaskPatch(
  tasks: TaskItemView[],
  taskId: string,
  patch: TaskPatch,
): ApplyTaskPatchResult {
  let previousTask: TaskItemView | null = null;
  const nextTasks = tasks.map((task) => {
    if (task.id !== taskId) return task;
    previousTask = task;
    return { ...task, ...patch };
  });
  return { nextTasks, previousTask };
}

export function rollbackTaskPatch(
  tasks: TaskItemView[],
  taskId: string,
  previousTask: TaskItemView | null,
): TaskItemView[] {
  if (!previousTask) return tasks;
  return tasks.map((task) => (task.id === taskId ? previousTask : task));
}

export function toTaskStatusDonePatch(): { status: WorkItemStatus } {
  return { status: "DONE" };
}
