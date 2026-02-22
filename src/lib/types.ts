/**
 * Core domain types for Mission Control.
 * These mirror the SUPERVISOR_SYSTEM filesystem structure.
 */

/** Possible states a task can be in, matching TASKS/ subdirectory names. */
export type TaskState = "BACKLOG" | "PLANNED" | "ASSIGNED" | "DONE" | "BLOCKED";

/** All valid task states, ordered by lifecycle progression. */
export const TASK_STATES: readonly TaskState[] = [
  "BACKLOG",
  "PLANNED",
  "ASSIGNED",
  "DONE",
  "BLOCKED",
] as const;

/** A single input entry on a task. */
export interface TaskInput {
  name: string;
  value: unknown;
}

/** Constraints section of a task YAML. */
export interface TaskConstraints {
  tools_allowed?: string[];
}

/** Output requirements section of a task YAML. */
export interface TaskOutputRequirements {
  format?: string;
  success_criteria?: string;
}

/** Parsed task from a YAML file in TASKS/<state>/. */
export interface Task {
  task_id: string;
  objective: string;
  worker_type: string;
  inputs?: TaskInput[];
  constraints?: TaskConstraints;
  output_requirements?: TaskOutputRequirements;
  /** Runtime: which state folder this task was found in. */
  state: TaskState;
  /** Runtime: which story this task belongs to. */
  story_id: string;
  /** Set when the task YAML failed to parse or validate. */
  parseError?: string;
}

/** A story, parsed from STORIES/<id>/STORY.md plus metadata. */
export interface Story {
  id: string;
  /** Raw markdown content of STORY.md. */
  content: string;
  /** Count of tasks per state. */
  task_counts: Record<TaskState, number>;
}

/** A result artifact directory for a completed task. */
export interface TaskResult {
  task_id: string;
  /** Files found in RESULTS/<task-id>/. */
  files: ResultFile[];
}

/** A single file in a task's result directory. */
export interface ResultFile {
  name: string;
  /** Relative path within the result directory. */
  path: string;
  /** File content (text files only; binary files get null). */
  content: string | null;
}
