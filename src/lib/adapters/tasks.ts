/**
 * Server-only adapter for reading tasks from the SUPERVISOR_SYSTEM filesystem.
 */
import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";

import { STORIES_PATH } from "./config";
import type { Task, TaskState } from "../types";
import { TASK_STATES } from "../types";

/**
 * List all tasks for a given story, across all state folders.
 */
export async function listTasksForStory(storyId: string): Promise<Task[]> {
  const tasksDir = join(STORIES_PATH, storyId, "TASKS");
  const tasks: Task[] = [];

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
      if (task) tasks.push(task);
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
): Promise<Task | null> {
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
 * Parse a single task YAML file into a Task object.
 */
async function parseTaskFile(
  filePath: string,
  state: TaskState,
  storyId: string
): Promise<Task | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = yaml.load(raw) as Record<string, unknown>;

    if (!data || typeof data !== "object" || !data.task_id) {
      return null;
    }

    return {
      task_id: data.task_id as string,
      objective: (data.objective as string) || "",
      worker_type: (data.worker_type as string) || "unknown",
      inputs: data.inputs as Task["inputs"],
      constraints: data.constraints as Task["constraints"],
      output_requirements: data.output_requirements as Task["output_requirements"],
      state,
      story_id: storyId,
    };
  } catch {
    return null;
  }
}
