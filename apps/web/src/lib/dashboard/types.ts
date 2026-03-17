/**
 * Types for the Dashboard page: LLM costs and recent requests.
 */

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  countObservations: number;
}

/** Raw Langfuse daily metrics per-model shape. */
export interface LangfuseModelUsage {
  model: string;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  totalCost: number;
  countObservations: number;
}

export interface DailyCost {
  date: string;
  totalCost: number;
  countObservations: number;
  usage: LangfuseModelUsage[];
}

export interface CostMetrics {
  daily: DailyCost[];
}

export interface LLMRequest {
  id: string;
  name: string | null;
  model: string | null;
  startTime: string;
  endTime: string | null;
  completionStartTime: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  latencyMs: number | null;
  metadata: Record<string, unknown> | null;
}

export interface LLMRequestsResponse {
  data: LLMRequest[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ImportStatusInfo {
  lastImport: {
    id: number;
    started_at: string;
    finished_at: string | null;
    mode: string;
    from_timestamp: string | null;
    to_timestamp: string;
    status: "running" | "success" | "failed";
    error_message: string | null;
  } | null;
  lastStatus: "running" | "success" | "failed" | null;
  counts: { metrics: number; requests: number };
}
