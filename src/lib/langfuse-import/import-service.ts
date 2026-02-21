/**
 * Langfuse import service — orchestrates full and incremental data imports.
 * Server-only module.
 *
 * Usage:
 *   const service = new LangfuseImportService();
 *   const result = await service.runImport();
 *
 * The service auto-detects whether to run a full or incremental import
 * based on whether prior successful imports exist in the database.
 */
import "server-only";

import { LangfuseRepository } from "./repository";
import { LangfuseClient } from "./langfuse-client";
import type {
  ImportRecord,
  DailyMetric,
  LangfuseRequest,
  LangfuseApiDailyData,
  LangfuseApiObservation,
} from "./types";

/** Number of days to look back for a full import. */
const FULL_IMPORT_LOOKBACK_DAYS = 90;

export class LangfuseImportService {
  private repo: LangfuseRepository;
  private client: LangfuseClient;

  constructor(repo?: LangfuseRepository, client?: LangfuseClient) {
    this.repo = repo ?? new LangfuseRepository();
    this.client = client ?? new LangfuseClient();
  }

  /**
   * Runs a Langfuse import. Auto-detects full vs incremental mode.
   *
   * - Full import: triggered when no prior successful import exists.
   *   Fetches the last 90 days of daily metrics and all observations.
   *
   * - Incremental import: triggered when a prior successful import exists.
   *   Fetches only data newer than the last import's to_timestamp.
   *
   * The import is idempotent — duplicate data is upserted, not duplicated.
   * On failure, the import run is marked as 'failed' with the error message.
   *
   * @returns The completed ImportRecord (status will be 'success' or 'failed').
   */
  async runImport(): Promise<ImportRecord> {
    const lastImport = this.repo.getLastSuccessfulImport();
    const isIncremental = lastImport !== null;

    const now = new Date();
    const toTimestamp = now.toISOString();

    let fromTimestamp: string | null = null;
    let fromDate: string;

    if (isIncremental && lastImport) {
      // Incremental: start from last successful import's to_timestamp
      fromTimestamp = lastImport.to_timestamp;
      fromDate = lastImport.to_timestamp.split("T")[0];
    } else {
      // Full: look back N days
      const lookback = new Date(now);
      lookback.setDate(lookback.getDate() - FULL_IMPORT_LOOKBACK_DAYS);
      fromDate = lookback.toISOString().split("T")[0];
    }

    const toDate = now.toISOString().split("T")[0];
    const mode = isIncremental ? "incremental" : "full";

    // Create the import run record
    const importRun = this.repo.createImportRun(
      mode,
      fromTimestamp,
      toTimestamp,
    );

    try {
      // 1. Fetch and upsert daily metrics
      const rawMetrics = await this.client.fetchDailyMetrics(fromDate, toDate);
      const dailyMetrics = this.transformDailyMetrics(rawMetrics);
      this.repo.upsertDailyMetrics(dailyMetrics);

      // 2. Fetch and upsert observations/requests
      const rawObservations = await this.client.fetchAllObservations(
        fromTimestamp ?? undefined,
      );
      const requests = this.transformObservations(rawObservations);
      this.repo.upsertRequests(requests);

      // 3. Mark import as successful
      this.repo.completeImportRun(importRun.id, "success");

      return {
        ...importRun,
        finished_at: new Date().toISOString(),
        status: "success",
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      this.repo.completeImportRun(importRun.id, "failed", errorMessage);

      return {
        ...importRun,
        finished_at: new Date().toISOString(),
        status: "failed",
        error_message: errorMessage,
      };
    }
  }

  /**
   * Transforms raw Langfuse daily metrics API data into flat DailyMetric rows.
   * Each day may have multiple models, each becoming its own row.
   */
  private transformDailyMetrics(
    raw: LangfuseApiDailyData[],
  ): DailyMetric[] {
    const metrics: DailyMetric[] = [];

    for (const day of raw) {
      // Extract just the date part (YYYY-MM-DD)
      const date = day.date.split("T")[0];

      for (const usage of day.usage ?? []) {
        metrics.push({
          date,
          model: usage.model ?? "unknown",
          input_tokens: usage.inputUsage ?? 0,
          output_tokens: usage.outputUsage ?? 0,
          total_tokens: usage.totalUsage ?? 0,
          request_count: usage.countObservations ?? 0,
          total_cost: usage.totalCost ?? 0,
        });
      }
    }

    return metrics;
  }

  /**
   * Transforms raw Langfuse observation API data into LangfuseRequest rows.
   */
  private transformObservations(
    raw: LangfuseApiObservation[],
  ): LangfuseRequest[] {
    return raw.map((obs) => {
      const inputTokens = obs.usage?.input ?? 0;
      const outputTokens = obs.usage?.output ?? 0;
      const totalTokens = obs.usage?.total ?? 0;

      let latencyMs: number | null = null;
      if (obs.startTime && obs.endTime) {
        latencyMs =
          new Date(obs.endTime).getTime() -
          new Date(obs.startTime).getTime();
      }

      return {
        id: obs.id,
        trace_id: obs.traceId ?? null,
        name: obs.name ?? null,
        model: obs.model ?? null,
        started_at: obs.startTime ?? null,
        finished_at: obs.endTime ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost: obs.calculatedTotalCost ?? null,
        latency_ms: latencyMs,
      };
    });
  }
}
