/**
 * Thin Langfuse API client for fetching metrics and observations.
 * Server-only — all Langfuse HTTP calls are confined to this module.
 *
 * This client is ONLY used by the import service during explicit imports.
 * No other module should call Langfuse APIs.
 */
import "server-only";

import type { LangfuseApiDailyData, LangfuseApiObservation } from "./types";

interface LangfuseClientConfig {
  host: string;
  publicKey: string;
  secretKey: string;
}

/** Maximum observations per page (v2 API supports up to 1000). */
const OBSERVATIONS_PAGE_SIZE = 1000;

/** Maximum retry attempts for rate-limited (429) requests. */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff (1s, 2s, 4s). */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Fetches a URL with retry logic for 429 (rate-limited) responses.
 * Uses the Retry-After header if present, otherwise exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);

    if (res.status !== 429 || attempt === MAX_RETRIES) {
      return res;
    }

    const retryAfter = res.headers.get("Retry-After");
    const delayMs = retryAfter
      ? Number(retryAfter) * 1000
      : BASE_RETRY_DELAY_MS * 2 ** attempt;

    console.log(
      `[Langfuse] ${label} returned 429, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Unreachable, but satisfies TypeScript
  throw new Error(`[Langfuse] ${label} exceeded max retries`);
}

export class LangfuseClient {
  private config: LangfuseClientConfig;
  private authHeader: string;

  constructor(config?: LangfuseClientConfig) {
    const host = config?.host ?? process.env.LANGFUSE_HOST;
    const publicKey = config?.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = config?.secretKey ?? process.env.LANGFUSE_SECRET_KEY;

    if (!host || !publicKey || !secretKey) {
      throw new Error(
        "Langfuse configuration missing. Set LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, and LANGFUSE_SECRET_KEY.",
      );
    }

    this.config = { host, publicKey, secretKey };
    this.authHeader = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
  }

  /**
   * Fetches daily metrics from Langfuse for the given date range
   * using the v1 Metrics API (/api/public/metrics).
   * @param from - Start date (ISO date string, e.g. "2026-01-01")
   * @param to - End date (ISO date string, e.g. "2026-02-21")
   */
  async fetchDailyMetrics(
    from: string,
    to: string,
  ): Promise<LangfuseApiDailyData[]> {
    const query = {
      view: "observations",
      metrics: [
        { measure: "totalCost", aggregation: "sum" },
        { measure: "inputTokens", aggregation: "sum" },
        { measure: "outputTokens", aggregation: "sum" },
        { measure: "totalTokens", aggregation: "sum" },
        { measure: "count", aggregation: "count" },
      ],
      dimensions: [{ field: "providedModelName" }],
      timeDimension: { granularity: "day" },
      fromTimestamp: `${from}T00:00:00Z`,
      toTimestamp: `${to}T23:59:59Z`,
      filters: [],
    };

    const url = new URL("/api/public/metrics", this.config.host);
    url.searchParams.set("query", JSON.stringify(query));

    const res = await fetchWithRetry(
      url.toString(),
      { headers: { Authorization: this.authHeader } },
      "metrics",
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Langfuse metrics failed (${res.status}): ${text}`,
      );
    }

    const json = await res.json();
    return (json.data ?? []) as LangfuseApiDailyData[];
  }

  /**
   * Fetches all GENERATION observations from Langfuse using the v2 cursor-based API.
   * Requests only core, basic, usage, and model fields to avoid fetching full input/output JSON.
   * Optionally filters by fromStartTime for incremental imports.
   *
   * @param fromTimestamp - If provided, only fetch observations after this ISO timestamp.
   */
  async fetchAllObservations(
    fromTimestamp?: string,
  ): Promise<LangfuseApiObservation[]> {
    const allObservations: LangfuseApiObservation[] = [];
    let cursor: string | null = null;
    let pageNum = 0;

    for (;;) {
      const params = new URLSearchParams({
        type: "GENERATION",
        limit: String(OBSERVATIONS_PAGE_SIZE),
        fields: "core,basic,usage,model",
      });
      if (fromTimestamp) {
        params.set("fromStartTime", fromTimestamp);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }

      pageNum++;
      const url = `${this.config.host}/api/public/v2/observations?${params}`;
      const res = await fetchWithRetry(
        url,
        { headers: { Authorization: this.authHeader } },
        `observations (page ${pageNum})`,
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Langfuse observations failed (${res.status}): ${text}`,
        );
      }

      const json = await res.json();
      const data = (json.data ?? []) as LangfuseApiObservation[];
      allObservations.push(...data);

      const meta = json.meta as { cursor: string | null } | undefined;
      if (!meta?.cursor || data.length === 0) {
        break;
      }
      cursor = meta.cursor;
    }

    return allObservations;
  }
}
