/**
 * Service layer for dashboard data — encapsulates aggregation and mapping
 * logic that was previously duplicated across API routes and the SSR page.
 */
import "server-only";

import { LangfuseRepository } from "./repository";
import type {
  CostMetrics,
  DailyCost,
  LangfuseModelUsage,
  LLMRequest,
  LLMRequestsResponse,
  ImportStatusInfo,
} from "../dashboard-types";

export class DashboardService {
  private repo: LangfuseRepository;

  constructor(repo?: LangfuseRepository) {
    this.repo = repo ?? new LangfuseRepository();
  }

  /**
   * Fetches daily cost metrics for a date range.
   * Groups per-model DailyMetric rows into per-date DailyCost entries.
   *
   * @param from - Start date (YYYY-MM-DD) or ISO timestamp
   * @param to   - End date (YYYY-MM-DD) or ISO timestamp
   */
  getCosts(from: string, to: string): CostMetrics {
    // ISO timestamps (contain "T") → query individual requests for
    // timezone-aware boundaries; plain dates → pre-aggregated daily metrics.
    const useTimestamps = from.includes("T") && to.includes("T");
    const metrics = useTimestamps
      ? this.repo.getMetricsByTimeRange(from, to)
      : this.repo.getDailyMetrics(from, to);

    const dateMap = new Map<string, DailyCost>();

    for (const m of metrics) {
      let entry = dateMap.get(m.date);
      if (!entry) {
        entry = {
          date: m.date,
          totalCost: 0,
          countObservations: 0,
          usage: [],
        };
        dateMap.set(m.date, entry);
      }

      entry.totalCost += m.total_cost;
      entry.countObservations += m.request_count;

      const usage: LangfuseModelUsage = {
        model: m.model,
        inputUsage: m.input_tokens,
        outputUsage: m.output_tokens,
        totalUsage: m.total_tokens,
        totalCost: m.total_cost,
        countObservations: m.request_count,
      };
      entry.usage.push(usage);
    }

    const daily = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return { daily };
  }

  /** Fetches the latest import record and DB counts. */
  getImportStatus(): ImportStatusInfo {
    const lastImport = this.repo.getLatestImport();
    const counts = this.repo.getCounts();

    return {
      lastImport,
      lastStatus: lastImport?.status ?? null,
      counts,
    };
  }

  /**
   * Fetches paginated LLM requests, mapping from internal DB shape
   * to the LLMRequest DTO.
   */
  getRequests(
    page: number,
    limit: number,
    model?: string,
    fromDate?: string,
    toDate?: string,
  ): LLMRequestsResponse {
    const { data: rows, total } = this.repo.getRequests(
      page,
      limit,
      model,
      fromDate,
      toDate,
    );

    const data: LLMRequest[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      model: r.model,
      startTime: r.started_at ?? new Date().toISOString(),
      endTime: r.finished_at ?? null,
      completionStartTime: null,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      totalTokens: r.total_tokens,
      cost: r.cost,
      latencyMs: r.latency_ms,
      metadata: null,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: { page, limit, totalItems: total, totalPages },
    };
  }
}
