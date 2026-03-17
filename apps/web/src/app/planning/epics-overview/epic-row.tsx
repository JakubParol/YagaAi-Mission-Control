"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { EpicStatus, ItemStatus } from "@/lib/planning/types";

import {
  type EpicOverviewItem,
  type EpicOverviewStoryPreview,
  type EpicOverviewStoryPreviewFilters,
} from "./overview-types";
import {
  applyStoryPreviewFilters,
  toPercentLabel,
  toStoriesLabel,
} from "./overview-view-model";
import { StoryPreviewTable } from "./story-preview-table";

// ─── Config objects ─────────────────────────────────────────────────

const PREVIEW_STATUS_OPTIONS = [
  { value: "", label: "Story status: All" },
  { value: "TODO", label: "TODO" },
  { value: "IN_PROGRESS", label: "IN PROGRESS" },
  { value: "CODE_REVIEW", label: "CODE REVIEW" },
  { value: "VERIFY", label: "VERIFY" },
  { value: "DONE", label: "DONE" },
];

const PREVIEW_BLOCKED_OPTIONS = [
  { value: "", label: "Blocked: All" },
  { value: "true", label: "Blocked only" },
  { value: "false", label: "Unblocked only" },
];

// ─── Variant helpers ────────────────────────────────────────────────

function statusVariant(status: EpicStatus): "outline" | "secondary" | "default" {
  if (status === "DONE") return "default";
  if (status === "IN_PROGRESS") return "secondary";
  return "outline";
}

// ─── Small sub-components ───────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-muted/50" role="presentation">
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

// ─── Preview state ──────────────────────────────────────────────────

export type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; stories: EpicOverviewStoryPreview[] };

// ─── Props ──────────────────────────────────────────────────────────

export interface EpicRowProps {
  item: EpicOverviewItem;
  isExpanded: boolean;
  previewState: PreviewState;
  previewFilters: EpicOverviewStoryPreviewFilters;
  storyPendingById: Record<string, boolean>;
  actionError: string | undefined;
  onToggleExpand: (epicKey: string) => void;
  onPreviewFilterChange: (epicKey: string, patch: Partial<EpicOverviewStoryPreviewFilters>) => void;
  onChangeStoryStatus: (epicKey: string, story: EpicOverviewStoryPreview, nextStatus: ItemStatus) => void;
  onAddStoryToSprint: (epicKey: string, story: EpicOverviewStoryPreview) => void;
}

// ─── Component ──────────────────────────────────────────────────────

export function EpicRow({
  item,
  isExpanded,
  previewState,
  previewFilters,
  storyPendingById,
  actionError,
  onToggleExpand,
  onPreviewFilterChange,
  onChangeStoryStatus,
  onAddStoryToSprint,
}: EpicRowProps) {
  const stories = previewState.kind === "ready"
    ? applyStoryPreviewFilters(previewState.stories, previewFilters)
    : [];

  return (
    <article className="px-3 py-2.5">
      <div className="grid grid-cols-[40px_120px_minmax(0,1fr)_90px_160px_130px_90px] gap-2">
        <button
          type="button"
          aria-label={isExpanded ? `Collapse ${item.epic_key}` : `Expand ${item.epic_key}`}
          onClick={() => onToggleExpand(item.epic_key)}
          className="inline-flex size-7 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <p className="pt-1 font-mono text-xs text-muted-foreground">{item.epic_key}</p>
        <p className="truncate pt-1 text-sm text-foreground" title={item.title}>{item.title}</p>

        <Badge variant={statusVariant(item.status)} className="h-fit w-fit text-[11px]">
          {item.status.replaceAll("_", " ")}
        </Badge>

        <div className="space-y-1">
          <ProgressBar value={item.progress_pct} />
          <p className="text-[11px] text-muted-foreground">{toPercentLabel(item.progress_pct)}</p>
        </div>

        <p className="text-[11px] text-muted-foreground">{toStoriesLabel(item)}</p>

        <div className="flex items-center gap-1 text-[11px]">
          {item.blocked_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-red-300">
              <AlertTriangle className="size-3" />
              {item.blocked_count}
            </span>
          ) : (
            <span className="text-emerald-300">ok</span>
          )}
          {item.stale_days >= 7 ? (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
              {item.stale_days}d
            </span>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <div className="ml-10 mt-3 rounded-md border border-border/40 bg-background/30 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ThemedSelect
              value={previewFilters.status}
              options={PREVIEW_STATUS_OPTIONS}
              placeholder="Story status"
              onValueChange={(value) => onPreviewFilterChange(item.epic_key, {
                status: value as ItemStatus | "",
              })}
              triggerClassName="h-8 min-w-[170px] bg-background/80 text-xs"
              contentClassName="w-[220px]"
            />
            <ThemedSelect
              value={previewFilters.blocked}
              options={PREVIEW_BLOCKED_OPTIONS}
              placeholder="Blocked"
              onValueChange={(value) => onPreviewFilterChange(item.epic_key, {
                blocked: value as "" | "true" | "false",
              })}
              triggerClassName="h-8 min-w-[160px] bg-background/80 text-xs"
              contentClassName="w-[210px]"
            />
          </div>

          {actionError ? (
            <p className="mb-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
              {actionError}
            </p>
          ) : null}

          {previewState.kind === "loading" || previewState.kind === "idle" ? (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading story preview...
            </div>
          ) : null}

          {previewState.kind === "error" ? (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-2 text-xs text-red-200">
              {previewState.message}
            </div>
          ) : null}

          {previewState.kind === "ready" ? (
            stories.length === 0 ? (
              <div className="rounded border border-border/40 bg-background/40 px-2 py-3 text-xs text-muted-foreground">
                No stories match preview filters.
              </div>
            ) : (
              <StoryPreviewTable
                stories={stories}
                epicKey={item.epic_key}
                storyPendingById={storyPendingById}
                onChangeStoryStatus={onChangeStoryStatus}
                onAddStoryToSprint={onAddStoryToSprint}
              />
            )
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
