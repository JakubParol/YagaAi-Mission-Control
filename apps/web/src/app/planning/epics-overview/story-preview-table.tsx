"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { WorkItemStatus } from "@/lib/planning/types";

import { parseItemStatus } from "./epics-page-actions";
import type { EpicOverviewStoryPreview } from "./overview-types";
import {
  toStoryPreviewAssignee,
  toStoryPreviewTitle,
  toStoryPreviewUpdatedAt,
} from "./overview-view-model";

// ─── Config ─────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "TODO", label: "TODO" },
  { value: "IN_PROGRESS", label: "IN PROGRESS" },
  { value: "CODE_REVIEW", label: "CODE REVIEW" },
  { value: "VERIFY", label: "VERIFY" },
  { value: "DONE", label: "DONE" },
];

// ─── Variant helpers ────────────────────────────────────────────────

function storyStatusVariant(status: WorkItemStatus): "outline" | "secondary" | "default" {
  if (status === "DONE") return "default";
  if (status === "IN_PROGRESS" || status === "CODE_REVIEW" || status === "VERIFY") {
    return "secondary";
  }
  return "outline";
}

// ─── Sub-component ──────────────────────────────────────────────────

function StoryBlockedBadge({ blocked }: { blocked: boolean }) {
  if (blocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
        <AlertTriangle className="size-3" />
        blocked
      </span>
    );
  }
  return <span className="text-[10px] text-emerald-300">ok</span>;
}

// ─── Props ──────────────────────────────────────────────────────────

export interface StoryPreviewTableProps {
  stories: EpicOverviewStoryPreview[];
  epicKey: string;
  storyPendingById: Record<string, boolean>;
  onStoryClick?: (storyId: string) => void;
  onChangeStoryStatus: (epicKey: string, story: EpicOverviewStoryPreview, nextStatus: WorkItemStatus) => void;
  onMoveToEpic: (story: EpicOverviewStoryPreview) => void;
}

// ─── Component ──────────────────────────────────────────────────────

export function StoryPreviewTable({
  stories,
  epicKey,
  storyPendingById,
  onStoryClick,
  onChangeStoryStatus,
  onMoveToEpic,
}: StoryPreviewTableProps) {
  return (
    <div className="overflow-hidden rounded border border-border/40">
      <div className="overflow-x-auto">
        <div className="min-w-[1030px]">
          <div className="grid grid-cols-[120px_minmax(0,1fr)_130px_140px_110px_150px_260px] gap-2 border-b border-border/30 bg-background/50 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Story</span>
            <span>Title</span>
            <span>Status</span>
            <span>Assignee</span>
            <span>Blocked</span>
            <span>Updated</span>
            <span>Quick actions</span>
          </div>
          <div className="divide-y divide-border/20">
            {stories.map((story) => {
              const pending = Boolean(storyPendingById[story.work_item_id]);

              return (
                <div
                  key={story.work_item_id}
                  className="grid grid-cols-[120px_minmax(0,1fr)_130px_140px_110px_150px_260px] gap-2 px-2 py-2"
                >
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {story.work_item_key ?? "\u2014"}
                  </span>

                  <button
                    type="button"
                    onClick={() => onStoryClick?.(story.work_item_id)}
                    disabled={!onStoryClick}
                    className="truncate text-left text-xs text-foreground transition-colors hover:text-primary disabled:cursor-default"
                    title={toStoryPreviewTitle(story)}
                  >
                    {story.title}
                  </button>

                  <Badge variant={storyStatusVariant(story.status)} className="h-fit w-fit text-[10px]">
                    {story.status.replaceAll("_", " ")}
                  </Badge>

                  <span className="truncate text-xs text-muted-foreground">
                    {toStoryPreviewAssignee(story)}
                  </span>

                  <StoryBlockedBadge blocked={story.is_blocked} />

                  <span className="text-xs text-muted-foreground">
                    {toStoryPreviewUpdatedAt(story)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <ThemedSelect
                      value={story.status}
                      options={STATUS_OPTIONS}
                      placeholder="Status"
                      disabled={pending}
                      onValueChange={(value) => {
                        const status = parseItemStatus(value);
                        if (!status || status === story.status) return;
                        onChangeStoryStatus(epicKey, story, status);
                      }}
                      triggerClassName="h-7 min-w-[118px] bg-background/80 text-[10px]"
                      contentClassName="w-[170px]"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={pending}
                      onClick={() => onMoveToEpic(story)}
                    >
                      <ArrowRight className="size-3" />
                      Move to epic
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
