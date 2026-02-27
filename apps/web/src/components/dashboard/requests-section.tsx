"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatUSD, formatTokens, timeAgo } from "./format-helpers";
import type { LLMRequest, LLMRequestsResponse } from "@/lib/dashboard-types";

function RequestRow({ req }: { req: LLMRequest }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-border transition-colors hover:bg-white/[0.02]"
      >
        <td className="px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {timeAgo(req.startTime)}
          </span>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-foreground">
          {req.model ?? "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
          {formatTokens(req.inputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
          {formatTokens(req.outputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-foreground">
          {req.cost != null ? formatUSD(req.cost) : "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
          {req.latencyMs != null ? `${(req.latencyMs / 1000).toFixed(1)}s` : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">ID: </span>
                <span className="font-mono text-foreground">
                  {req.id.slice(0, 12)}...
                </span>
              </div>
              {req.name && (
                <div>
                  <span className="text-muted-foreground">Name: </span>
                  <span className="text-foreground">{req.name}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Total tokens: </span>
                <span className="tabular-nums text-foreground">
                  {formatTokens(req.totalTokens)}
                </span>
              </div>
              {req.completionStartTime && (
                <div>
                  <span className="text-muted-foreground">TTFB: </span>
                  <span className="tabular-nums text-foreground">
                    {(
                      (new Date(req.completionStartTime).getTime() -
                        new Date(req.startTime).getTime()) /
                      1000
                    ).toFixed(1)}
                    s
                  </span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function RequestsSection({
  initialData,
}: {
  initialData: LLMRequestsResponse;
}) {
  const [page, setPage] = useState(1);
  const [modelFilter, setModelFilter] = useState<string>("");

  const url = `/api/dashboard/requests?page=${page}${modelFilter ? `&model=${encodeURIComponent(modelFilter)}` : ""}`;
  const { data: response } = useAutoRefresh<LLMRequestsResponse>({
    url,
    interval: 30000,
    initialData,
  });

  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/dashboard/requests/models")
      .then((res) => res.json())
      .then((data) => setModels(data.models ?? []))
      .catch(() => {});
  }, []);

  return (
    <section aria-label="Recent LLM requests">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Requests
        </h2>
        <select
          value={modelFilter}
          onChange={(e) => {
            setModelFilter(e.target.value);
            setPage(1);
          }}
          className="focus-ring rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
          aria-label="Filter by model"
        >
          <option value="">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Model
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Tokens In
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Tokens Out
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Cost
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Latency
              </th>
            </tr>
          </thead>
          <tbody>
            {response.data.length > 0 ? (
              response.data.map((req) => (
                <RequestRow key={req.id} req={req} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No requests found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {response.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {response.meta.page} of {response.meta.totalPages} ({response.meta.totalItems} total)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={cn(
                "focus-ring rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
                page <= 1
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : "text-foreground hover:bg-white/[0.04]",
              )}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= response.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={cn(
                "focus-ring rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
                page >= response.meta.totalPages
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : "text-foreground hover:bg-white/[0.04]",
              )}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
