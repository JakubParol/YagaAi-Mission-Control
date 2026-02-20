/**
 * Server-only adapter for reading task results from the SUPERVISOR_SYSTEM filesystem.
 */
import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

import { STORIES_PATH } from "./config";
import type { TaskResult, ResultFile } from "../types";

/** File extensions treated as text (content will be read). */
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".yaml",
  ".yml",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".log",
  ".csv",
  ".xml",
  ".toml",
  ".sh",
  ".py",
  ".rs",
  ".go",
]);

/**
 * Get results for a task.
 * Returns null if no RESULTS/<taskId> directory exists.
 */
export async function getTaskResults(
  storyId: string,
  taskId: string
): Promise<TaskResult | null> {
  const resultsDir = join(STORIES_PATH, storyId, "RESULTS", taskId);

  try {
    const info = await stat(resultsDir);
    if (!info.isDirectory()) return null;
  } catch {
    return null;
  }

  const files = await collectFiles(resultsDir, "");
  return { task_id: taskId, files };
}

/**
 * Check if results exist for a task (without reading content).
 */
export async function hasTaskResults(
  storyId: string,
  taskId: string
): Promise<boolean> {
  const resultsDir = join(STORIES_PATH, storyId, "RESULTS", taskId);
  try {
    const info = await stat(resultsDir);
    return info.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively collect files from a directory.
 */
async function collectFiles(
  baseDir: string,
  relativePath: string
): Promise<ResultFile[]> {
  const dirPath = join(baseDir, relativePath);
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: ResultFile[] = [];

  for (const entry of entries) {
    const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectFiles(baseDir, entryRelPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      let content: string | null = null;

      if (TEXT_EXTENSIONS.has(ext)) {
        try {
          content = await readFile(join(baseDir, entryRelPath), "utf-8");
        } catch {
          content = null;
        }
      }

      results.push({
        name: entry.name,
        path: entryRelPath,
        content,
      });
    }
  }

  return results;
}
