/**
 * SQL statements for SQLite schema initialization.
 * All tables are created idempotently (IF NOT EXISTS).
 */

export const CREATE_IMPORTS_TABLE = `
CREATE TABLE IF NOT EXISTS imports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT    NOT NULL,
  finished_at     TEXT,
  mode            TEXT    NOT NULL CHECK (mode IN ('full', 'incremental')),
  from_timestamp  TEXT,
  to_timestamp    TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_message   TEXT
);
`;

export const CREATE_DAILY_METRICS_TABLE = `
CREATE TABLE IF NOT EXISTS langfuse_daily_metrics (
  date           TEXT    NOT NULL,
  model          TEXT    NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  request_count  INTEGER NOT NULL DEFAULT 0,
  total_cost     REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model)
);
`;

export const CREATE_REQUESTS_TABLE = `
CREATE TABLE IF NOT EXISTS langfuse_requests (
  id             TEXT    PRIMARY KEY,
  trace_id       TEXT,
  name           TEXT,
  model          TEXT,
  started_at     TEXT,
  finished_at    TEXT,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  cost           REAL,
  latency_ms     INTEGER
);
`;

/** All schema statements in order. */
export const SCHEMA_STATEMENTS = [
  CREATE_IMPORTS_TABLE,
  CREATE_DAILY_METRICS_TABLE,
  CREATE_REQUESTS_TABLE,
];
