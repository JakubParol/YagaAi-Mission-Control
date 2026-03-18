import { Fragment, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import type { WorkItemStatus } from "@/lib/planning/types";
import { StoryCard, type StoryCardStory } from "./story-card";
import { StoryActionsMenu } from "./story-actions-menu";
import {
  StoryAssigneeControl,
  type StoryAssigneeSelection,
} from "@/components/planning/story-assignee-control";
import type { QuickCreateAssigneeOption, QuickCreateSubmitInput } from "@/app/planning/board/quick-create";
import { TodoQuickCreate } from "./sprint-board-quick-create";

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Describes where a dragged card should be inserted within a column.
 * Both fields may be null when dropping into an empty column.
 */
export interface DropPlacement {
  /** Id of the story this card will be placed immediately before, or null when placing at end. */
  beforeId: string | null;
  /** Id of the story this card will be placed immediately after, or null when placing at start. */
  afterId: string | null;
}

// ─── Props ───────────────────────────────────────────────────────────

export interface BoardColumnProps {
  status: WorkItemStatus;
  label: string;
  accent: string;
  stories: StoryCardStory[];
  isDropTarget: boolean;
  onDragOver: (status: WorkItemStatus, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (status: WorkItemStatus, event: DragEvent<HTMLDivElement>, placement: DropPlacement | null) => void;
  onStoryClick?: (storyId: string) => void;
  onCardDragStart: (storyId: string) => void;
  onCardDragEnd: () => void;
  pendingStoryIds: Set<string>;
  onStoryDelete?: (storyId: string) => Promise<void> | void;
  onStoryStatusChange?: (storyId: string, status: WorkItemStatus) => void;
  onTodoQuickCreate?: (input: Omit<QuickCreateSubmitInput, "projectId">) => Promise<void>;
  assigneeOptions: readonly QuickCreateAssigneeOption[];
  assigneeOverrides: Readonly<Record<string, StoryAssigneeSelection>>;
  onStoryAssigneeChange: (storyId: string, assignee: StoryAssigneeSelection) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export function BoardColumn({
  status,
  label,
  accent,
  stories,
  isDropTarget,
  onDragOver,
  onDrop,
  onStoryClick,
  onCardDragStart,
  onCardDragEnd,
  pendingStoryIds,
  onStoryDelete,
  onStoryStatusChange,
  onTodoQuickCreate,
  assigneeOptions,
  assigneeOverrides,
  onStoryAssigneeChange,
}: BoardColumnProps) {
  /**
   * dropSlot tracks the insertion point within the column during drag.
   * 0 = before first card, stories.length = after last card, null = unknown.
   */
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  const handleCardDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const newSlot = event.clientY - rect.top < rect.height / 2 ? index : index + 1;
    if (dropSlot !== newSlot) setDropSlot(newSlot);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setDropSlot(null);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const placement: DropPlacement | null =
      dropSlot !== null
        ? {
            afterId: dropSlot > 0 ? (stories[dropSlot - 1]?.id ?? null) : null,
            beforeId: dropSlot < stories.length ? (stories[dropSlot]?.id ?? null) : null,
          }
        : null;
    setDropSlot(null);
    onDrop(status, event, placement);
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border/40 bg-muted/20",
        "border-l-2",
        accent,
        isDropTarget && "ring-1 ring-blue-400/50 bg-blue-500/5",
      )}
      onDragOver={(event) => onDragOver(status, event)}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="flex items-center justify-center min-w-[20px] rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {stories.length}
        </span>
      </div>

      {status === "TODO" && onTodoQuickCreate && (
        <TodoQuickCreate assigneeOptions={assigneeOptions} onTodoQuickCreate={onTodoQuickCreate} />
      )}

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {stories.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[80px] text-[11px] text-muted-foreground/50">
            No stories
          </div>
        ) : (
          <>
            {stories.map((story, index) => {
              const isPending = pendingStoryIds.has(story.id);
              const assignee = assigneeOverrides[story.id] ?? {
                assignee_agent_id: story.assignee_agent_id ?? null,
                assignee_name: story.assignee_name ?? null,
                assignee_last_name: story.assignee_last_name ?? null,
                assignee_initials: story.assignee_initials ?? null,
                assignee_avatar: story.assignee_avatar ?? null,
              };
              return (
                <Fragment key={story.id}>
                  {dropSlot === index && (
                    <div className="h-0.5 rounded-full bg-blue-400/70" aria-hidden="true" />
                  )}
                  <div onDragOver={(event) => handleCardDragOver(event, index)}>
                    <StoryCard
                      story={{
                        ...story,
                        assignee_agent_id: assignee.assignee_agent_id,
                        assignee_name: assignee.assignee_name,
                        assignee_last_name: assignee.assignee_last_name,
                        assignee_initials: assignee.assignee_initials,
                        assignee_avatar: assignee.assignee_avatar,
                      }}
                      onClick={onStoryClick}
                      onDragStart={onCardDragStart}
                      onDragEnd={() => { setDropSlot(null); onCardDragEnd(); }}
                      disabled={isPending}
                      assigneeControl={(
                        <StoryAssigneeControl
                          storyId={story.id}
                          currentAssignee={assignee}
                          assigneeOptions={assigneeOptions}
                          disabled={isPending}
                          onChange={onStoryAssigneeChange}
                        />
                      )}
                      actions={
                        onStoryDelete ? (
                          <StoryActionsMenu
                            storyId={story.id}
                            storyType={story.sub_type ?? story.type}
                            storyKey={story.key}
                            storyTitle={story.title}
                            storyStatus={story.status}
                            onDelete={onStoryDelete}
                            onStatusChange={onStoryStatusChange}
                            onAddLabel={onStoryClick}
                            disabled={isPending}
                            isDeleting={isPending}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                </Fragment>
              );
            })}
            {dropSlot === stories.length && (
              <div className="h-0.5 rounded-full bg-blue-400/70" aria-hidden="true" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
