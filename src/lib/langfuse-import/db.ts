/**
 * SQLite database connection singleton with auto-initialization.
 * Server-only — never import from client components.
 *
 * The database file lives at `data/mission-control.db` relative to the
 * project root (configurable via MC_DB_PATH env var).
 */
import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { SCHEMA_STATEMENTS } from "./schema";

const DEFAULT_DB_PATH = path.resolve(
  process.cwd(),
  "data",
  "mission-control.db",
);

/** Resolved path to the SQLite database file. */
export const DB_PATH = process.env.MC_DB_PATH || DEFAULT_DB_PATH;

/** Whether the path was explicitly configured via env var. */
const isExplicitPath = !!process.env.MC_DB_PATH;

export interface DbStatus {
  ok: boolean;
  path: string;
  error?: string;
}

/** Check whether the database file exists and is accessible. */
export function getDbStatus(): DbStatus {
  if (!fs.existsSync(DB_PATH)) {
    return {
      ok: false,
      path: DB_PATH,
      error: isExplicitPath
        ? `Database file not found at MC_DB_PATH: ${DB_PATH}`
        : `Database file not found at default path: ${DB_PATH}. Import data from Langfuse to create it.`,
    };
  }
  return { ok: true, path: DB_PATH };
}

let _db: Database.Database | null = null;

/**
 * Returns the singleton SQLite database connection.
 * When using the default path, auto-creates the database on first access.
 * When MC_DB_PATH is set explicitly, throws if the file does not exist.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  if (isExplicitPath && !fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found at MC_DB_PATH: ${DB_PATH}`);
  }

  // Auto-create directory/file only for the default path
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Initialize schema
  for (const sql of SCHEMA_STATEMENTS) {
    _db.exec(sql);
  }

  return _db;
}

/**
 * Closes the database connection. Useful for tests and graceful shutdown.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
