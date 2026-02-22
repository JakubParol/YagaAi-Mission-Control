/**
 * Types for the Langfuse import system and local SQLite persistence.
 */

/** Import run modes. */
export type ImportMode = "full" | "incremental";

/** Import run status values. */
export type ImportStatus = "running" | "success" | "failed";

/** A record of an import run stored in the `imports` table. */
export interface ImportRecord {
  id: number;
  started_at: string;
  finished_at: string | null;
  mode: ImportMode;
  from_timestamp: string | null;
  to_timestamp: string;
  status: ImportStatus;
  error_message: string | null;
}

/** A daily metrics row keyed by (date, model). */
export interface DailyMetric {
  date: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_count: number;
  total_cost: number;
}

/** A single Langfuse observation/request stored locally. */
export interface LangfuseRequest {
  id: string;
  trace_id: string | null;
  name: string | null;
  model: string | null;
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number | null;
  latency_ms: number | null;
}

/** Paginated query result for requests. */
export interface PaginatedRequests {
  data: LangfuseRequest[];
  total: number;
}

/** Result shape from the Langfuse /api/public/metrics endpoint (v1 Metrics API). */
export interface LangfuseApiDailyData {
  providedModelName: string;
  time_dimension: string;
  sum_totalCost: number;
  sum_inputTokens: string;
  sum_outputTokens: string;
  sum_totalTokens: string;
  count_count: string;
}

/** Result shape from the Langfuse /api/public/observations endpoint. */
export interface LangfuseApiObservation {
  id: string;
  traceId: string | null;
  name: string | null;
  model: string | null;
  startTime: string | null;
  endTime: string | null;
  completionStartTime: string | null;
  usage: {
    input?: number;
    output?: number;
    total?: number;
  } | null;
  calculatedTotalCost: number | null;
  metadata: Record<string, unknown> | null;
}
