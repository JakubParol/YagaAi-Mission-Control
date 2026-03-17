"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { ItemStatus } from "@/lib/planning/types";

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

function storyStatusVariant(status: ItemStatus): "outline" | "secondary" | "default" {
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
  onChangeStoryStatus: (epicKey: string, story: EpicOverviewStoryPreview, nextStatus: ItemStatus) => void;
  onAddStoryToSprint: (epicKey: string, story: EpicOverviewStoryPreview) => void;
}

// ─── Component ──────────────────────────────────────────────────────

export function StoryPreviewTable({
  stories,
  epicKey,
  storyPendingById,
  onChangeStoryStatus,
  onAddStoryToSprint,
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
              const pending = Boolean(storyPendingById[story.story_id]);

              return (
                <div
                  key={story.story_id}
                  className="grid grid-cols-[120px_minmax(0,1fr)_130px_140px_110px_150px_260px] gap-2 px-2 py-2"
                >
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {story.story_key ?? "\u2014"}
                  </span>

                  <span className="truncate text-xs text-foreground" title={toStoryPreviewTitle(story)}>
                    {story.title}
                  </span>

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
                    <Link
                      href={`/planning/stories/${story.story_id}`}
                      className="inline-flex h-7 items-center gap-1 rounded border border-border/60 px-2 text-[10px] text-foreground transition-colors hover:border-border"
                    >
                      Details
                      <ExternalLink className="size-3" />
                    </Link>

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

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        onAddStoryToSprint(epicKey, story);
                      }}
                      className="inline-flex h-7 items-center rounded border border-border/60 px-2 text-[10px] text-foreground transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Add to sprint
                    </button>
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
