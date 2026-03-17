/**
 * Dashboard API calls.
 * All fetch operations for the dashboard feature live here —
 * components consume these instead of calling fetch() inline.
 */

import { apiUrl } from "@/lib/api-client";
import { startOfDay } from "@/lib/dashboard/format-helpers";
import type {
  CostMetrics,
  DailyCost,
  ImportStatusInfo,
} from "@/lib/dashboard/types";
import { mergeStatCardData, type CostStatCardValues } from "./costs-view-model";

/** Fetch cost metrics for a pre-built URL. */
export async function fetchCostMetrics(url: string): Promise<CostMetrics> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as CostMetrics;
}

/** Fetch today + yesterday cost data and return merged stat card values. */
export async function fetchStatCardData(): Promise<CostStatCardValues> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const todayUrl = apiUrl(
    `/v1/observability/costs?from=${todayStart.toISOString()}&to=${now.toISOString()}`,
  );
  const yesterdayUrl = apiUrl(
    `/v1/observability/costs?from=${yesterdayStart.toISOString()}&to=${todayStart.toISOString()}`,
  );

  const [todayData, yesterdayData] = await Promise.all([
    fetch(todayUrl).then((r) => r.json()),
    fetch(yesterdayUrl).then((r) => r.json()),
  ]);

  const todayDaily: DailyCost[] = todayData.daily ?? [];
  const yesterdayDaily: DailyCost[] = yesterdayData.daily ?? [];
  return mergeStatCardData(todayDaily, yesterdayDaily);
}

/** Fetch current import status from the API. */
export async function fetchImportStatus(): Promise<ImportStatusInfo | null> {
  const response = await fetch(apiUrl("/v1/observability/imports/status"));
  if (!response.ok) return null;
  return (await response.json()) as ImportStatusInfo;
}

/** Trigger a Langfuse import. Throws on failure. */
export async function triggerImport(): Promise<void> {
  const response = await fetch(apiUrl("/v1/observability/imports"), {
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const envelope = body as { error?: string };
    throw new Error(envelope.error ?? `HTTP ${response.status}`);
  }
}

/** Fetch available model names for the request filter dropdown. */
export async function fetchRequestModels(): Promise<string[]> {
  const response = await fetch(apiUrl("/v1/observability/requests/models"));
  if (!response.ok) return [];
  const data = (await response.json()) as { models?: string[] };
  return data.models ?? [];
}
