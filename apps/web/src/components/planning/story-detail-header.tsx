"use client";

import { ExternalLink, Loader2 } from "lucide-react";

import type { ItemStatus, StoryDetail } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  story: StoryDetail;
  storyDraft: StoryDraft;
  embedded: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onStatusChange: (storyId: string, status: ItemStatus) => void;
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
        <select
          value={story.status}
          disabled={isSaving}
          onChange={(e) => onStatusChange(story.id, e.target.value as ItemStatus)}
          className={cn(
            "h-5 cursor-pointer appearance-none rounded-full border-0 px-2 text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-ring",
            STATUS_STYLE[story.status].bg,
            STATUS_STYLE[story.status].text,
          )}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {isSaving && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}

        <div className={STORY_DETAIL_HEADER_LAYOUT.actionsGroup}>
          {shouldShowStoryDetailActions(story.story_type) && (
            <StoryActionsMenu
              storyId={story.id}
              storyType={story.story_type}
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
          {/* "Open in new tab" — only shown in dialog (overlay) mode */}
          {!embedded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`/planning/stories/${story.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in new tab</TooltipContent>
            </Tooltip>
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
