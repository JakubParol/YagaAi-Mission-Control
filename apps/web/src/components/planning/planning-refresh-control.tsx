"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SUCCESS_STATE_TTL_MS = 2000;

export type PlanningRefreshPhase = "idle" | "loading" | "success" | "error";

export interface PlanningRefreshState {
  phase: PlanningRefreshPhase;
  errorMessage: string | null;
  refreshedAt: number | null;
}

export function toPlanningRefreshErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Failed to refresh this view.";
}

export async function runPlanningRefresh(
  refresh: () => Promise<void>,
  setState: (next: PlanningRefreshState) => void,
  now: () => number = () => Date.now(),
): Promise<void> {
  setState({ phase: "loading", errorMessage: null, refreshedAt: null });
  try {
    await refresh();
    setState({ phase: "success", errorMessage: null, refreshedAt: now() });
  } catch (error) {
    setState({
      phase: "error",
      errorMessage: toPlanningRefreshErrorMessage(error),
      refreshedAt: null,
    });
    throw error;
  }
}

interface PlanningRefreshControlProps {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
  className?: string;
}

export function PlanningRefreshControl({
  onRefresh,
  disabled = false,
  disabledReason = "Select a single project to refresh this view.",
  label = "Refresh view",
  className,
}: PlanningRefreshControlProps) {
  const [state, setState] = useState<PlanningRefreshState>({
    phase: "idle",
    errorMessage: null,
    refreshedAt: null,
  });

  useEffect(() => {
    if (state.phase !== "success") return;
    const timeoutId = window.setTimeout(() => {
      setState((prev) =>
        prev.phase === "success" ? { phase: "idle", errorMessage: null, refreshedAt: null } : prev,
      );
    }, SUCCESS_STATE_TTL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [state.phase]);

  const triggerRefresh = useCallback(async () => {
    if (disabled || state.phase === "loading") return;
    try {
      await runPlanningRefresh(onRefresh, setState);
    } catch {
      // state already tracks error; no-op here
    }
  }, [disabled, onRefresh, state.phase]);

  const buttonLabel =
    state.phase === "loading"
      ? "Refreshing..."
      : state.phase === "error"
        ? "Retry refresh"
        : label;
  const tooltipText = disabled ? disabledReason : "Refetch current view data";

  return (
    <div className={cn("flex flex-col items-end gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void triggerRefresh()}
              disabled={disabled || state.phase === "loading"}
              className={cn(
                "gap-1.5 border-border/60 bg-card/30",
                state.phase === "error" && "border-red-400/50 text-red-200 hover:text-red-100",
              )}
            >
              {state.phase === "loading" && <Loader2 className="size-3.5 animate-spin" />}
              {state.phase === "success" && <CheckCircle2 className="size-3.5 text-emerald-300" />}
              {(state.phase === "idle" || state.phase === "error") && (
                <RefreshCw className="size-3.5" />
              )}
              {buttonLabel}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipText}</TooltipContent>
      </Tooltip>

      {state.phase === "success" && (
        <p className="text-[11px] text-emerald-300" role="status" aria-live="polite">
          Updated just now.
        </p>
      )}

      {state.phase === "error" && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{state.errorMessage}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 text-[11px] text-red-100 hover:bg-red-500/20 hover:text-red-50"
            onClick={() => void triggerRefresh()}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
