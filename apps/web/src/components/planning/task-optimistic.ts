import type { ItemStatus } from "@/lib/planning/types";
import type { TaskItem } from "./story-view";

export interface TaskDraftInput {
  storyId: string;
  title: string;
  objective: string | null;
  task_type: string;
  priority: number | null;
  estimate_points: number | null;
  due_at: string | null;
}

export function createOptimisticTask(draft: TaskDraftInput, tempId: string): TaskItem {
  return {
    id: tempId,
    key: null,
    title: draft.title,
    objective: draft.objective,
    task_type: draft.task_type,
    status: "TODO",
    priority: draft.priority,
    is_blocked: false,
    blocked_reason: null,
    estimate_points: draft.estimate_points,
    due_at: draft.due_at,
    current_assignee_agent_id: null,
  };
}

export function addOptimisticTask(tasks: TaskItem[], task: TaskItem): TaskItem[] {
  return [task, ...tasks];
}

export function replaceTask(tasks: TaskItem[], taskId: string, replacement: TaskItem): TaskItem[] {
  return tasks.map((task) => (task.id === taskId ? replacement : task));
}

export function removeTask(tasks: TaskItem[], taskId: string): TaskItem[] {
  return tasks.filter((task) => task.id !== taskId);
}

export type TaskPatch = Partial<
  Pick<
    TaskItem,
    | "title"
    | "objective"
    | "task_type"
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
  nextTasks: TaskItem[];
  previousTask: TaskItem | null;
}

export function applyOptimisticTaskPatch(
  tasks: TaskItem[],
  taskId: string,
  patch: TaskPatch,
): ApplyTaskPatchResult {
  let previousTask: TaskItem | null = null;
  const nextTasks = tasks.map((task) => {
    if (task.id !== taskId) return task;
    previousTask = task;
    return { ...task, ...patch };
  });
  return { nextTasks, previousTask };
}

export function rollbackTaskPatch(
  tasks: TaskItem[],
  taskId: string,
  previousTask: TaskItem | null,
): TaskItem[] {
  if (!previousTask) return tasks;
  return tasks.map((task) => (task.id === taskId ? previousTask : task));
}

export function toTaskStatusDonePatch(): { status: ItemStatus } {
  return { status: "DONE" };
}
