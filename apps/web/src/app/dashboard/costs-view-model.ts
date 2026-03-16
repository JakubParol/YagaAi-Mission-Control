/**
 * Pure view-model functions for the LLM costs section.
 * No React, no side effects — easy to test.
 */

import { apiUrl } from "@/lib/api-client";
import { startOfDay } from "@/lib/dashboard/format-helpers";
import type {
  CostMetrics,
  DailyCost,
  LangfuseModelUsage,
  ModelUsage,
} from "@/lib/dashboard/types";
import type { DateRange } from "react-day-picker";

export const TIME_RANGES = [
  { label: "Today", key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "7 Days", key: "7d" },
  { label: "30 Days", key: "30d" },
] as const;

/**
 * All filters use ISO timestamps so the API queries individual requests
 * with timezone-aware boundaries (local midnight → now / next midnight).
 */
export function buildCostUrl(
  activeFilter: string,
  customRange?: DateRange,
): string {
  const now = new Date();
  const todayStart = startOfDay(now);

  let from: string;
  let to: string;

  if (activeFilter === "custom" && customRange?.from) {
    const fromDay = startOfDay(customRange.from);
    const toDay = customRange.to ? startOfDay(customRange.to) : fromDay;
    const toNextDay = new Date(toDay);
    toNextDay.setDate(toNextDay.getDate() + 1);
    from = fromDay.toISOString();
    to = toNextDay.toISOString();
  } else {
    switch (activeFilter) {
      case "today":
        from = todayStart.toISOString();
        to = now.toISOString();
        break;
      case "yesterday": {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        from = yesterdayStart.toISOString();
        to = todayStart.toISOString();
        break;
      }
      case "30d": {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - 30);
        from = d.toISOString();
        to = now.toISOString();
        break;
      }
      default: {
        // "7d"
        const d = new Date(todayStart);
        d.setDate(d.getDate() - 7);
        from = d.toISOString();
        to = now.toISOString();
        break;
      }
    }
  }

  return apiUrl(`/v1/observability/costs?from=${from}&to=${to}`);
}

function mapUsage(u: LangfuseModelUsage): ModelUsage {
  return {
    model: u.model,
    inputTokens: u.inputUsage ?? 0,
    outputTokens: u.outputUsage ?? 0,
    totalCost: u.totalCost ?? 0,
    countObservations: u.countObservations ?? 0,
  };
}

export interface CostStatCardValues {
  todaySpend: number;
  yesterdaySpend: number;
  todayRequests: number;
  avgCost: number;
}

/** Compute stat card values from daily cost data (single-day data). */
export function aggregateStatCards(daily: DailyCost[]): CostStatCardValues {
  let todaySpend = 0;
  let todayRequests = 0;

  for (const day of daily) {
    todaySpend += day.totalCost ?? 0;
    todayRequests += day.countObservations ?? 0;
  }

  return {
    todaySpend,
    yesterdaySpend: 0,
    todayRequests,
    avgCost: todayRequests > 0 ? todaySpend / todayRequests : 0,
  };
}

/** Merge today and yesterday fetched data into stat card values. */
export function mergeStatCardData(
  todayDaily: DailyCost[],
  yesterdayDaily: DailyCost[],
): CostStatCardValues {
  const todaySpend = todayDaily.reduce((s, d) => s + (d.totalCost ?? 0), 0);
  const todayReqs = todayDaily.reduce((s, d) => s + (d.countObservations ?? 0), 0);
  const yesterdaySpend = yesterdayDaily.reduce((s, d) => s + (d.totalCost ?? 0), 0);
  return {
    todaySpend,
    yesterdaySpend,
    todayRequests: todayReqs,
    avgCost: todayReqs > 0 ? todaySpend / todayReqs : 0,
  };
}

/** Aggregate per-model breakdown from filtered daily data. */
export function aggregateModels(daily: DailyCost[]): ModelUsage[] {
  const modelMap = new Map<string, ModelUsage>();

  for (const day of daily) {
    for (const u of day.usage ?? []) {
      const existing = modelMap.get(u.model);
      if (existing) {
        existing.inputTokens += u.inputUsage ?? 0;
        existing.outputTokens += u.outputUsage ?? 0;
        existing.totalCost += u.totalCost ?? 0;
        existing.countObservations += u.countObservations ?? 0;
      } else {
        modelMap.set(u.model, mapUsage(u));
      }
    }
  }

  return Array.from(modelMap.values()).sort(
    (a, b) => b.totalCost - a.totalCost,
  );
}

export interface CostTotals {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

/** Compute totals from aggregated model data. */
export function computeCostTotals(models: ModelUsage[]): CostTotals {
  return {
    requests: models.reduce((s, m) => s + m.countObservations, 0),
    tokensIn: models.reduce((s, m) => s + m.inputTokens, 0),
    tokensOut: models.reduce((s, m) => s + m.outputTokens, 0),
    cost: models.reduce((s, m) => s + m.totalCost, 0),
  };
}

/** Build custom date range display label. */
export function buildCustomRangeLabel(
  customRange: DateRange | undefined,
  formatFn: (date: Date, format: string) => string,
): string | null {
  if (!customRange?.from) return null;

  if (
    customRange.to &&
    customRange.to.getTime() !== customRange.from.getTime()
  ) {
    return `${formatFn(customRange.from, "MMM d")} – ${formatFn(customRange.to, "MMM d")}`;
  }

  return formatFn(customRange.from, "MMM d, yyyy");
}

/** Fetch cost metrics for a given URL. */
export async function fetchCostMetrics(url: string): Promise<CostMetrics> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CostMetrics;
}
