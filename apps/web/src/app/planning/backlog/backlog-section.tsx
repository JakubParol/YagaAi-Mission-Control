"use client";

import { useState } from "react";

import type { WorkItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { BacklogRow, type BacklogAssigneeOption } from "@/components/planning/backlog-row";
import { BacklogRowsHeader } from "@/components/planning/backlog-rows-header";
import {
  BacklogSectionHeader,
  type BacklogSiblingItem,
  type MoveDirection,
} from "@/components/planning/backlog-section-header";
import { StoryActionsMenu } from "@/components/planning/story-actions-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { BacklogWithItems } from "./backlog-types";
import { buildBacklogTargetsForStory } from "./backlog-page-derived";

export interface BacklogSectionProps {
  section: BacklogWithItems;
  isActiveSprint: boolean;
  hasAnyActiveSprint: boolean;
  siblingBacklogs: ReadonlyArray<BacklogSiblingItem>;
  assigneeOptions: readonly BacklogAssigneeOption[];
  allSections: readonly BacklogWithItems[];
  storyMembershipMap: Map<string, Set<string>>;
  onStoryClick: (storyId: string) => void;
  onStoryAssigneeChange: (storyId: string, nextAssigneeAgentId: string | null) => void;
  onAddToBacklog: (storyId: string, backlogId: string) => void | Promise<void>;
  onRemoveFromBacklog: (storyId: string, backlogId: string) => void | Promise<void>;
  onStartSprint: (backlogId: string, backlogName: string) => void;
  onCompleteSprint: (backlogId: string, backlogName: string) => void;
  onCreateStory: (backlogId: string) => void;
  onStoryDelete: (storyId: string) => void;
  onStoryStatusChange: (storyId: string, status: WorkItemStatus) => void;
  onEditBoard: (backlogId: string) => void;
  onDeleteBoard: (backlogId: string, backlogName: string, isDefault: boolean) => void;
  onMoveBoard: (backlogId: string, direction: MoveDirection) => void;
  pendingStoryIds: ReadonlySet<string>;
  pendingDeleteStoryIds: ReadonlySet<string>;
  pendingSprintIds: ReadonlySet<string>;
  pendingBoardIds: ReadonlySet<string>;
}

export function BacklogSection({
  section,
  isActiveSprint: _isActiveSprint,
  hasAnyActiveSprint,
  siblingBacklogs,
  allSections,
  storyMembershipMap,
  assigneeOptions,
  onStoryClick,
  onStoryAssigneeChange,
  onAddToBacklog,
  onRemoveFromBacklog,
  onStartSprint,
  onCompleteSprint,
  onCreateStory,
  onStoryDelete,
  onStoryStatusChange,
  onEditBoard,
  onDeleteBoard,
  onMoveBoard,
  pendingStoryIds,
  pendingDeleteStoryIds,
  pendingSprintIds,
  pendingBoardIds,
}: BacklogSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { backlog, items } = section;
  const isSprintPending = pendingSprintIds.has(backlog.id);
  const isBoardDeletePending = pendingBoardIds.has(backlog.id);

  return (
    <section
      className={cn(
        "rounded-lg border border-border/60 bg-card/30 overflow-hidden",
      )}
    >
      <BacklogSectionHeader
        backlog={backlog}
        collapsed={collapsed}
        stories={items}
        hasAnyActiveSprint={hasAnyActiveSprint}
        isSprintPending={isSprintPending}
        isBoardDeletePending={isBoardDeletePending}
        siblingBacklogs={siblingBacklogs}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        onStartSprint={onStartSprint}
        onCompleteSprint={onCompleteSprint}
        onCreateStory={onCreateStory}
        onEditBoard={onEditBoard}
        onDeleteBoard={onDeleteBoard}
        onMoveBoard={onMoveBoard}
      />

      {/* Row list */}
      {!collapsed && (
        <div className="border-t border-border/30">
          <BacklogRowsHeader />

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">
              No stories in this backlog
            </p>
          ) : (
            <div className="divide-y divide-border/25">
              {items.map((story) => (
                <BacklogRow
                  key={story.id}
                  item={story}
                  onClick={onStoryClick}
                  assigneeOptions={assigneeOptions}
                  assigneePending={pendingStoryIds.has(story.id)}
                  onAssigneeChange={onStoryAssigneeChange}
                  actions={(
                    <div className="flex items-center justify-end gap-1">
                      <StoryActionsMenu
                        storyId={story.id}
                        storyType={story.sub_type ?? story.type}
                        storyKey={story.key}
                        storyTitle={story.title}
                        storyStatus={story.status}
                        onDelete={onStoryDelete}
                        onStatusChange={onStoryStatusChange}
                        onAddLabel={onStoryClick}
                        backlogMembershipActions={{
                          targets: buildBacklogTargetsForStory(allSections, story.id, storyMembershipMap, backlog.id),
                          onAdd: onAddToBacklog,
                          onRemove: onRemoveFromBacklog,
                        }}
                        disabled={pendingStoryIds.has(story.id)}
                        isDeleting={pendingDeleteStoryIds.has(story.id)}
                      />
                    </div>
                  )}
                />
              ))}
            </div>
          )}

          <div className="border-t border-border/20 px-3 py-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={backlog.kind !== "BACKLOG"}
                  className="text-muted-foreground"
                  onClick={() => {
                    if (backlog.kind === "BACKLOG") onCreateStory(backlog.id);
                  }}
                >
                  + Create
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {backlog.kind === "BACKLOG"
                  ? "Create story"
                  : "Only product backlog supports story creation"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </section>
  );
}
