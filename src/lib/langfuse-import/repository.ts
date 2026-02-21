/**
 * Repository for all SQLite database operations related to Langfuse imports.
 * Provides clean methods for reading/writing import runs, daily metrics, and requests.
 *
 * All methods are synchronous (better-sqlite3 is synchronous by design).
 */
import "server-only";

import type Database from "better-sqlite3";
import { getDb } from "./db";
import type {
  ImportRecord,
  ImportMode,
  ImportStatus,
  DailyMetric,
  LangfuseRequest,
  PaginatedRequests,
} from "./types";

export class LangfuseRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDb();
  }

  // ─── Import Runs ────────────────────────────────────────────────────

  /** Returns the most recent successful import, or null if none exist. */
  getLastSuccessfulImport(): ImportRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM imports
         WHERE status = 'success'
         ORDER BY finished_at DESC
         LIMIT 1`,
      )
      .get() as ImportRecord | undefined;
    return row ?? null;
  }

  /** Creates a new import run record with status 'running'. Returns the created record. */
  createImportRun(
    mode: ImportMode,
    fromTimestamp: string | null,
    toTimestamp: string,
  ): ImportRecord {
    const startedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO imports (started_at, mode, from_timestamp, to_timestamp, status)
         VALUES (?, ?, ?, ?, 'running')`,
      )
      .run(startedAt, mode, fromTimestamp, toTimestamp);

    return {
      id: Number(result.lastInsertRowid),
      started_at: startedAt,
      finished_at: null,
      mode,
      from_timestamp: fromTimestamp,
      to_timestamp: toTimestamp,
      status: "running",
      error_message: null,
    };
  }

  /** Completes an import run by setting its status, finish time, and optional error. */
  completeImportRun(
    id: number,
    status: ImportStatus,
    errorMessage?: string,
  ): void {
    const finishedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE imports
         SET finished_at = ?, status = ?, error_message = ?
         WHERE id = ?`,
      )
      .run(finishedAt, status, errorMessage ?? null, id);
  }

  /** Returns all import runs ordered by most recent first. */
  getImportHistory(): ImportRecord[] {
    return this.db
      .prepare(`SELECT * FROM imports ORDER BY started_at DESC`)
      .all() as ImportRecord[];
  }

  /** Returns the most recent import of any status, or null if none exist. */
  getLatestImport(): ImportRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM imports
         ORDER BY started_at DESC
         LIMIT 1`,
      )
      .get() as ImportRecord | undefined;
    return row ?? null;
  }

  /** Returns total row counts for metrics and requests tables. */
  getCounts(): { metrics: number; requests: number } {
    const metricsRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM langfuse_daily_metrics`)
      .get() as { count: number };
    const requestsRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM langfuse_requests`)
      .get() as { count: number };
    return { metrics: metricsRow.count, requests: requestsRow.count };
  }

  // ─── Daily Metrics ──────────────────────────────────────────────────

  /**
   * Upserts daily metrics rows. Uses INSERT OR REPLACE on the (date, model) PK
   * to ensure idempotency.
   */
  upsertDailyMetrics(metrics: DailyMetric[]): void {
    if (metrics.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO langfuse_daily_metrics
         (date, model, input_tokens, output_tokens, total_tokens, request_count, total_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const upsertMany = this.db.transaction((rows: DailyMetric[]) => {
      for (const m of rows) {
        stmt.run(
          m.date,
          m.model,
          m.input_tokens,
          m.output_tokens,
          m.total_tokens,
          m.request_count,
          m.total_cost,
        );
      }
    });

    upsertMany(metrics);
  }

  /**
   * Queries daily metrics for a date range (inclusive).
   * @param from - Start date (YYYY-MM-DD)
   * @param to - End date (YYYY-MM-DD)
   */
  getDailyMetrics(from: string, to: string): DailyMetric[] {
    return this.db
      .prepare(
        `SELECT * FROM langfuse_daily_metrics
         WHERE date >= ? AND date <= ?
         ORDER BY date ASC, model ASC`,
      )
      .all(from, to) as DailyMetric[];
  }

  // ─── Requests / Observations ────────────────────────────────────────

  /**
   * Upserts request/observation rows. Uses INSERT OR REPLACE on the id PK
   * to ensure idempotency.
   */
  upsertRequests(requests: LangfuseRequest[]): void {
    if (requests.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO langfuse_requests
         (id, trace_id, name, model, started_at, finished_at,
          input_tokens, output_tokens, total_tokens, cost, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const upsertMany = this.db.transaction((rows: LangfuseRequest[]) => {
      for (const r of rows) {
        stmt.run(
          r.id,
          r.trace_id,
          r.name,
          r.model,
          r.started_at,
          r.finished_at,
          r.input_tokens,
          r.output_tokens,
          r.total_tokens,
          r.cost,
          r.latency_ms,
        );
      }
    });

    upsertMany(requests);
  }

  /**
   * Queries requests with pagination, optional model filter, and optional date range.
   * Returns data and total count for pagination metadata.
   */
  getRequests(
    page: number,
    limit: number,
    model?: string,
    fromDate?: string,
    toDate?: string,
  ): PaginatedRequests {
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (model) {
      conditions.push("model = ?");
      params.push(model);
    }
    if (fromDate) {
      conditions.push("started_at >= ?");
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push("started_at <= ?");
      params.push(toDate);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const data = this.db
      .prepare(
        `SELECT * FROM langfuse_requests
         ${where}
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as LangfuseRequest[];

    const countRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM langfuse_requests ${where}`,
      )
      .get(...params) as { count: number };

    return { data, total: countRow.count };
  }
}
