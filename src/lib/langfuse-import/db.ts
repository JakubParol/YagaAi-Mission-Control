/**
 * SQLite database connection singleton with auto-initialization.
 * Server-only — never import from client components.
 *
 * The database file lives at `data/mission-control.db` relative to the
 * project root (configurable via MC_DB_PATH env var). The `data/` directory
 * and DB file are created automatically on first access.
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

let _db: Database.Database | null = null;

/**
 * Returns the singleton SQLite database connection.
 * Creates the database file and initializes the schema on first call.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure the directory exists
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
