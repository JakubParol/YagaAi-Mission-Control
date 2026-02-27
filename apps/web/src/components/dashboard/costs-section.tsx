"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DollarSign,
  Hash,
  TrendingUp,
  CalendarDays,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatUSD,
  formatTokens,
  toDateStr,
  startOfDay,
} from "./format-helpers";
import type { DateRange } from "react-day-picker";
import type {
  CostMetrics,
  DailyCost,
  ModelUsage,
  LangfuseModelUsage,
} from "@/lib/dashboard-types";

const TIME_RANGES = [
  { label: "Today", key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "7 Days", key: "7d" },
  { label: "30 Days", key: "30d" },
] as const;

/**
 * All filters use ISO timestamps so the API queries individual requests
 * with timezone-aware boundaries (local midnight → now / next midnight).
 */
function buildCostUrl(
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

  return `/api/dashboard/costs?from=${from}&to=${to}`;
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

/** Compute stat card values — always based on today/yesterday regardless of filter. */
function aggregateStatCards(daily: DailyCost[]) {
  const now = new Date();
  const today = toDateStr(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateStr(yesterdayDate);

  let todaySpend = 0;
  let yesterdaySpend = 0;
  let todayRequests = 0;

  for (const day of daily) {
    const date = day.date?.split("T")[0];
    if (date === today) {
      todaySpend += day.totalCost ?? 0;
      todayRequests += day.countObservations ?? 0;
    }
    if (date === yesterday) {
      yesterdaySpend += day.totalCost ?? 0;
    }
  }

  const avgCost = todayRequests > 0 ? todaySpend / todayRequests : 0;
  return { todaySpend, yesterdaySpend, todayRequests, avgCost };
}

/** Aggregate per-model breakdown from filtered daily data. */
function aggregateModels(daily: DailyCost[]): ModelUsage[] {
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

function CostStatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div
        aria-hidden="true"
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          iconBg,
        )}
      >
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

export function CostsSection({ initialData }: { initialData: CostMetrics }) {
  const [activeFilter, setActiveFilter] = useState<string>("today");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const url = useMemo(() => buildCostUrl(activeFilter, customRange), [activeFilter, customRange]);

  const [costs, setCosts] = useState<CostMetrics>(initialData);
  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setCosts(data))
      .catch(() => {});
  }, [url]);

  const [statCards, setStatCards] = useState(() =>
    aggregateStatCards(initialData.daily),
  );
  useEffect(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const todayUrl = `/api/dashboard/costs?from=${todayStart.toISOString()}&to=${now.toISOString()}`;
    const yesterdayUrl = `/api/dashboard/costs?from=${yesterdayStart.toISOString()}&to=${todayStart.toISOString()}`;

    Promise.all([
      fetch(todayUrl).then((r) => r.json()),
      fetch(yesterdayUrl).then((r) => r.json()),
    ])
      .then(([todayData, yesterdayData]) => {
        const tDaily: DailyCost[] = todayData.daily ?? [];
        const yDaily: DailyCost[] = yesterdayData.daily ?? [];
        const todaySpend = tDaily.reduce((s, d) => s + (d.totalCost ?? 0), 0);
        const todayReqs = tDaily.reduce((s, d) => s + (d.countObservations ?? 0), 0);
        const yesterdaySpend = yDaily.reduce((s, d) => s + (d.totalCost ?? 0), 0);
        setStatCards({
          todaySpend,
          yesterdaySpend,
          todayRequests: todayReqs,
          avgCost: todayReqs > 0 ? todaySpend / todayReqs : 0,
        });
      })
      .catch(() => {});
  }, []);
  const { todaySpend, yesterdaySpend, todayRequests, avgCost } = statCards;

  const models = useMemo(
    () => aggregateModels(costs.daily),
    [costs.daily],
  );

  const totals = useMemo(() => ({
    requests: models.reduce((s, m) => s + m.countObservations, 0),
    tokensIn: models.reduce((s, m) => s + m.inputTokens, 0),
    tokensOut: models.reduce((s, m) => s + m.outputTokens, 0),
    cost: models.reduce((s, m) => s + m.totalCost, 0),
  }), [models]);

  const handlePresetClick = (key: string) => {
    setActiveFilter(key);
    setCustomRange(undefined);
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from) {
      setActiveFilter("custom");
    }
  };

  const handleClearCustom = () => {
    setCustomRange(undefined);
    setActiveFilter("7d");
    setCalendarOpen(false);
  };

  const customRangeLabel = customRange?.from
    ? customRange.to &&
      customRange.to.getTime() !== customRange.from.getTime()
      ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
      : format(customRange.from, "MMM d, yyyy")
    : null;

  return (
    <section aria-label="LLM costs">
      <h2 className="mb-4 text-lg font-semibold text-foreground">LLM Costs</h2>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CostStatCard
          label="Today's Spend"
          value={formatUSD(todaySpend)}
          icon={DollarSign}
          iconColor="text-green-400"
          iconBg="bg-green-500/10"
        />
        <CostStatCard
          label="Yesterday's Spend"
          value={formatUSD(yesterdaySpend)}
          icon={DollarSign}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
        />
        <CostStatCard
          label="Requests Today"
          value={String(todayRequests)}
          icon={Hash}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
        />
        <CostStatCard
          label="Avg Cost/Request"
          value={formatUSD(avgCost)}
          icon={TrendingUp}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10"
        />
      </div>

      {/* Date range picker — below stat cards, right-aligned */}
      <div className="mb-6 flex justify-end">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => handlePresetClick(range.key)}
                className={cn(
                  "focus-ring rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  activeFilter === range.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {range.label}
              </button>
            ))}
          </div>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeFilter === "custom"
                    ? "border-primary/30 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {customRangeLabel ?? "Custom"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={handleCalendarSelect}
                numberOfMonths={1}
                disabled={{ after: new Date() }}
              />
              {customRange?.from && (
                <div className="border-t border-border px-3 py-2">
                  <button
                    type="button"
                    onClick={handleClearCustom}
                    className="focus-ring w-full rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {activeFilter === "custom" && (
            <button
              type="button"
              onClick={handleClearCustom}
              className="focus-ring rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear date selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Per-model table — always visible */}
      <div className="mb-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Model
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Requests
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Tokens In
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Tokens Out
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Total Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {models.length > 0 && (
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2.5 text-xs font-semibold text-foreground">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">
                  {totals.requests}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">
                  {formatTokens(totals.tokensIn)}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">
                  {formatTokens(totals.tokensOut)}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">
                  {formatUSD(totals.cost)}
                </td>
              </tr>
            )}
            {models.length > 0 ? (
              models.map((m) => (
                <tr
                  key={m.model}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {m.model}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {m.countObservations}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatTokens(m.inputTokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatTokens(m.outputTokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatUSD(m.totalCost)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No model data for this period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
