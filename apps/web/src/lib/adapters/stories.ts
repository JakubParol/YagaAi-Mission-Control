/**
 * Server-only adapter for reading stories from the SUPERVISOR_SYSTEM filesystem.
 */
import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { STORIES_PATH } from "./config";
import { listTasksForStory } from "./tasks";
import type { SupervisorStory, TaskState } from "../types";

/**
 * List all stories in the SUPERVISOR_SYSTEM.
 * Reads each story's STORY.md and counts tasks per state.
 */
export async function listStories(): Promise<SupervisorStory[]> {
  let entries: string[];
  try {
    entries = await readdir(STORIES_PATH);
  } catch {
    return [];
  }

  const stories = await Promise.all(
    entries.map(async (id) => {
      const storyDir = join(STORIES_PATH, id);
      const storyFile = join(storyDir, "STORY.md");

      let content = "";
      try {
        content = await readFile(storyFile, "utf-8");
      } catch {
        // Story directory without STORY.md — skip content
      }

      const tasks = await listTasksForStory(id);
      const task_counts: Record<TaskState, number> = {
        BACKLOG: 0,
        PLANNED: 0,
        ASSIGNED: 0,
        DONE: 0,
        BLOCKED: 0,
      };
      for (const task of tasks) {
        task_counts[task.state]++;
      }

      return { id, content, task_counts };
    })
  );

  return stories;
}

/**
 * Get a single story by ID.
 * Returns null if the story directory doesn't exist.
 */
export async function getStory(id: string): Promise<SupervisorStory | null> {
  const storyDir = join(STORIES_PATH, id);
  const storyFile = join(storyDir, "STORY.md");

  let content: string;
  try {
    content = await readFile(storyFile, "utf-8");
  } catch {
    return null;
  }

  const tasks = await listTasksForStory(id);
  const task_counts: Record<TaskState, number> = {
    BACKLOG: 0,
    PLANNED: 0,
    ASSIGNED: 0,
    DONE: 0,
    BLOCKED: 0,
  };
  for (const task of tasks) {
    task_counts[task.state]++;
  }

  return { id, content, task_counts };
}
