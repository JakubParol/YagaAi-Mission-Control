/**
 * Types for the Dashboard page: agent status, LLM costs, and recent requests.
 */

export type AgentStatusValue = "idle" | "working";

export interface AgentStatus {
  name: string;
  role: string;
  status: AgentStatusValue;
  task?: string;
}

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
