/**
 * Core domain types for Mission Control.
 */

/** Possible states a task can be in. */
export type TaskState = "BACKLOG" | "PLANNED" | "ASSIGNED" | "DONE" | "BLOCKED";

/** All valid task states, ordered by lifecycle progression. */
export const TASK_STATES: readonly TaskState[] = [
  "BACKLOG",
  "PLANNED",
  "ASSIGNED",
  "DONE",
  "BLOCKED",
] as const;
