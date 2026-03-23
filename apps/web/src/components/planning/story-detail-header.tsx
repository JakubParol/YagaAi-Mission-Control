"use client";

import { Loader2 } from "lucide-react";

import type { WorkItemStatus, WorkItemDetail } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { DialogTitle } from "@/components/ui/dialog";
import { ThemedSelect } from "@/components/ui/themed-select";
import { STATUS_STYLE } from "./story-card";
import {
  isStoryActionsSupportedType,
  StoryActionsMenu,
} from "./story-actions-menu";
import { STATUS_OPTIONS, type StoryDraft } from "./story-detail-view-model";

export const STORY_DETAIL_HEADER_LAYOUT = {
  actionsGroup: "ml-auto flex items-center gap-1.5",
} as const;

export function shouldShowStoryDetailActions(storyType: string | null | undefined): boolean {
  return isStoryActionsSupportedType(storyType);
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface StoryDetailHeaderProps {
  story: WorkItemDetail;
  storyDraft: StoryDraft;
  embedded: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onStatusChange: (storyId: string, status: WorkItemStatus) => void;
  onDelete: (storyId: string) => void;
  onTitleChange: (value: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function StoryDetailHeader({
  story,
  storyDraft,
  embedded,
  isSaving,
  isDeleting,
  onStatusChange,
  onDelete,
  onTitleChange,
}: StoryDetailHeaderProps) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/40 px-5 py-4 shadow-sm">
      {/* Top row: key, status select, actions */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {story.key ?? "\u2014"}
        </span>

        {/* Inline status selector */}
        <ThemedSelect
          value={story.status}
          options={STATUS_OPTIONS}
          placeholder="Status"
          disabled={isSaving}
          ariaLabel="Story status"
          hideChevron
          triggerClassName={cn(
            "h-5 min-h-0 w-auto rounded-full border-0 px-2 text-[10px] font-medium",
            STATUS_STYLE[story.status].bg,
            STATUS_STYLE[story.status].text,
          )}
          contentClassName="w-[160px]"
          onValueChange={(v) => onStatusChange(story.id, v as WorkItemStatus)}
        />

        {isSaving && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}

        <div className={STORY_DETAIL_HEADER_LAYOUT.actionsGroup}>
          {shouldShowStoryDetailActions(story.sub_type) && (
            <StoryActionsMenu
              storyId={story.id}
              storyType={story.sub_type}
              storyKey={story.key ?? null}
              storyTitle={story.title}
              storyStatus={story.status}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onAddLabel={(storyId) => {
                if (storyId === story.id) {
                  const labelSection = document.getElementById("story-detail-labels");
                  labelSection?.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
              disabled={isSaving}
              isDeleting={isDeleting}
            />
          )}
        </div>
      </div>

      {/* Title input */}
      {embedded ? (
        <h1 className="sr-only">{story.title}</h1>
      ) : (
        <DialogTitle className="sr-only">{story.title}</DialogTitle>
      )}
      <input
        id="story-detail-title"
        value={storyDraft.title}
        onChange={(event) => onTitleChange(event.target.value)}
        className="w-full border-0 bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-0"
        placeholder="Story title\u2026"
      />
    </div>
  );
}
