/**
 * Server-only adapter for reading tasks from the SUPERVISOR_SYSTEM filesystem.
 */
import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import yaml from "js-yaml";

import { STORIES_PATH } from "./config";
import type { SupervisorTask, TaskState } from "../types";
import { TASK_STATES } from "../types";

/**
 * List all tasks for a given story, across all state folders.
 */
export async function listTasksForStory(storyId: string): Promise<SupervisorTask[]> {
  const tasksDir = join(STORIES_PATH, storyId, "TASKS");
  const tasks: SupervisorTask[] = [];

  for (const state of TASK_STATES) {
    const stateDir = join(tasksDir, state);
    let files: string[];
    try {
      files = await readdir(stateDir);
    } catch {
      continue;
    }

    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );

    const parsed = await Promise.all(
      yamlFiles.map((file) => parseTaskFile(join(stateDir, file), state, storyId))
    );

    for (const task of parsed) {
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Get a single task by story ID and task ID.
 * Searches all state folders.
 */
export async function getTask(
  storyId: string,
  taskId: string
): Promise<SupervisorTask | null> {
  const tasksDir = join(STORIES_PATH, storyId, "TASKS");

  for (const state of TASK_STATES) {
    const stateDir = join(tasksDir, state);
    let files: string[];
    try {
      files = await readdir(stateDir);
    } catch {
      continue;
    }

    const match = files.find((f) => {
      const name = f.replace(/\.(yaml|yml)$/, "");
      return name === taskId;
    });

    if (match) {
      return parseTaskFile(join(stateDir, match), state, storyId);
    }
  }

  return null;
}

/**
 * Build a placeholder Task for files that failed to parse or validate.
 */
function errorTask(
  filePath: string,
  state: TaskState,
  storyId: string,
  error: string
): SupervisorTask {
  const filename = basename(filePath, ".yaml").replace(/\.yml$/, "");
  return {
    task_id: filename || "unknown",
    objective: "",
    worker_type: "unknown",
    state,
    story_id: storyId,
    parseError: error,
  };
}

/**
 * Parse a single task YAML file into a Task object.
 * On failure, logs a warning and returns a placeholder with parseError set
 * so the UI can display an error badge instead of silently hiding the task.
 */
async function parseTaskFile(
  filePath: string,
  state: TaskState,
  storyId: string
): Promise<SupervisorTask> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = yaml.load(raw) as Record<string, unknown>;

    if (!data || typeof data !== "object") {
      const msg = "YAML parsed to non-object value";
      console.warn(`[parseTaskFile] ${basename(filePath)}: ${msg}`);
      return errorTask(filePath, state, storyId, msg);
    }

    if (!data.task_id) {
      const msg = "Missing required field: task_id";
      console.warn(`[parseTaskFile] ${basename(filePath)}: ${msg}`);
      return errorTask(filePath, state, storyId, msg);
    }

    return {
      task_id: data.task_id as string,
      objective: (data.objective as string) || "",
      worker_type: (data.worker_type as string) || "unknown",
      inputs: data.inputs as SupervisorTask["inputs"],
      constraints: data.constraints as SupervisorTask["constraints"],
      output_requirements: data.output_requirements as SupervisorTask["output_requirements"],
      state,
      story_id: storyId,
    };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Unknown parse error";
    console.warn(`[parseTaskFile] ${basename(filePath)}: ${msg}`);
    return errorTask(filePath, state, storyId, msg);
  }
}
