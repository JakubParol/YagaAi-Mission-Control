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

/** Maximum observations per page (Langfuse default max is 100). */
const OBSERVATIONS_PAGE_SIZE = 100;

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
   * Fetches daily metrics from Langfuse for the given date range.
   * @param from - Start date (ISO date string, e.g. "2026-01-01")
   * @param to - End date (ISO date string, e.g. "2026-02-21")
   */
  async fetchDailyMetrics(
    from: string,
    to: string,
  ): Promise<LangfuseApiDailyData[]> {
    const url = new URL(
      "/api/public/metrics/daily",
      this.config.host,
    );
    url.searchParams.set("tracesGroupedByName", "false");
    url.searchParams.set("fromTimestamp", `${from}T00:00:00Z`);
    url.searchParams.set("toTimestamp", `${to}T23:59:59Z`);

    const res = await fetch(url.toString(), {
      headers: { Authorization: this.authHeader },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Langfuse metrics/daily failed (${res.status}): ${text}`,
      );
    }

    const json = await res.json();
    return (json.data ?? []) as LangfuseApiDailyData[];
  }

  /**
   * Fetches all GENERATION observations from Langfuse, paginating through all pages.
   * Optionally filters by fromTimestamp for incremental imports.
   *
   * @param fromTimestamp - If provided, only fetch observations updated after this ISO timestamp.
   */
  async fetchAllObservations(
    fromTimestamp?: string,
  ): Promise<LangfuseApiObservation[]> {
    const allObservations: LangfuseApiObservation[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        type: "GENERATION",
        limit: String(OBSERVATIONS_PAGE_SIZE),
        page: String(page),
      });
      if (fromTimestamp) {
        params.set("fromStartTime", fromTimestamp);
      }

      const url = `${this.config.host}/api/public/observations?${params}`;
      const res = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Langfuse observations failed (${res.status}): ${text}`,
        );
      }

      const json = await res.json();
      const data = (json.data ?? []) as LangfuseApiObservation[];
      allObservations.push(...data);

      const meta = json.meta as
        | { page: number; totalPages: number }
        | undefined;
      if (!meta || page >= meta.totalPages || data.length === 0) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allObservations;
  }
}
