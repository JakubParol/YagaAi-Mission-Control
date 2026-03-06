"use client";

import { ChevronDown, ChevronRight, CircleCheckBig, Loader2, Play } from "lucide-react";

import { BacklogBoardActionsMenu } from "@/components/planning/backlog-board-actions-menu";
import { Button } from "@/components/ui/button";
import type { BacklogKind, BacklogStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";

interface BacklogSectionHeaderProps {
  backlog: {
    id: string;
    name: string;
    kind: BacklogKind;
    status: BacklogStatus;
    is_default: boolean;
  };
  collapsed: boolean;
  stories: ReadonlyArray<{ status: string; task_count: number }>;
  hasAnyActiveSprint: boolean;
  isSprintPending: boolean;
  isBoardDeletePending: boolean;
  onToggleCollapsed: () => void;
  onStartSprint: (backlogId: string, backlogName: string) => void;
  onCompleteSprint: (backlogId: string, backlogName: string) => void;
  onCreateStory: (backlogId: string) => void;
  onDeleteBoard: (backlogId: string, backlogName: string, isDefault: boolean) => void;
}

const KIND_LABEL: Record<BacklogKind, string> = {
  SPRINT: "Sprint",
  BACKLOG: "Backlog",
  IDEAS: "Ideas",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-blue-500/10 text-blue-300",
  OPEN: "bg-cyan-500/10 text-cyan-300",
  CLOSED: "bg-muted/40 text-muted-foreground/70",
};

function getStatusCount(
  stories: ReadonlyArray<{ status: string }>,
  status: "TODO" | "IN_PROGRESS" | "DONE",
): number {
  if (status === "IN_PROGRESS") {
    return stories.filter(
      (story) =>
        story.status === "IN_PROGRESS" ||
        story.status === "CODE_REVIEW" ||
        story.status === "VERIFY",
    ).length;
  }
  return stories.filter((story) => story.status === status).length;
}

function MetricChip({
  label,
  value,
  toneClassName,
}: {
  label: string;
  value: number;
  toneClassName: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-between gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        toneClassName,
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

export function BacklogSectionHeader({
  backlog,
  collapsed,
  stories,
  hasAnyActiveSprint,
  isSprintPending,
  isBoardDeletePending,
  onToggleCollapsed,
  onStartSprint,
  onCompleteSprint,
  onCreateStory,
  onDeleteBoard,
}: BacklogSectionHeaderProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const isSprint = backlog.kind === "SPRINT";
  const workItemCount = stories.length + stories.reduce((acc, story) => acc + story.task_count, 0);
  const todoCount = getStatusCount(stories, "TODO");
  const inProgressCount = getStatusCount(stories, "IN_PROGRESS");
  const doneCount = getStatusCount(stories, "DONE");
  const canCompleteSprint = isSprint && backlog.status === "ACTIVE";
  const canStartSprint = isSprint && backlog.status !== "ACTIVE";
  const isStartBlockedByActive = canStartSprint && hasAnyActiveSprint;
  const canDeleteBoard = !backlog.is_default;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm p-0.5",
          "hover:bg-muted/40 transition-colors duration-150",
          "focus-ring",
        )}
        aria-label={collapsed ? "Expand backlog section" : "Collapse backlog section"}
      >
        <Chevron className="size-4 text-muted-foreground" />
      </button>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3
            className="min-w-0 max-w-[24rem] shrink truncate text-sm font-semibold text-foreground"
            title={backlog.name}
          >
            {backlog.name}
          </h3>

          <span className="shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {KIND_LABEL[backlog.kind]}
          </span>

          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              STATUS_TONE[String(backlog.status)] ?? "bg-muted/40 text-muted-foreground/70",
            )}
          >
            {backlog.status}
          </span>

          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            #{workItemCount}
          </span>

          <div className="shrink-0">
            <MetricChip label="TODO" value={todoCount} toneClassName="bg-slate-500/10 text-slate-300" />
          </div>
          <div className="shrink-0">
            <MetricChip
              label="IN_PROGRESS"
              value={inProgressCount}
              toneClassName="bg-blue-500/10 text-blue-300"
            />
          </div>
          <div className="shrink-0">
            <MetricChip label="DONE" value={doneCount} toneClassName="bg-emerald-500/10 text-emerald-300" />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1">
        {canCompleteSprint && (
          <Button
            variant="outline"
            size="xs"
            disabled={isSprintPending}
            title="Complete sprint"
            onClick={() => onCompleteSprint(backlog.id, backlog.name)}
          >
            {isSprintPending ? <Loader2 className="size-3 animate-spin" /> : <CircleCheckBig className="size-3" />}
            Complete
          </Button>
        )}

        {canStartSprint && (
          <Button
            variant="outline"
            size="xs"
            disabled={isSprintPending || isStartBlockedByActive}
            title={
              isStartBlockedByActive
                ? "Complete the current active sprint before starting another."
                : "Start sprint"
            }
            onClick={() => onStartSprint(backlog.id, backlog.name)}
          >
            {isSprintPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            Start
          </Button>
        )}

        {backlog.kind === "BACKLOG" && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onCreateStory(backlog.id)}
            title="Create work item"
          >
            Create
          </Button>
        )}

        <BacklogBoardActionsMenu
          backlogName={backlog.name}
          canDelete={canDeleteBoard}
          isDeleting={isBoardDeletePending}
          onDelete={() => onDeleteBoard(backlog.id, backlog.name, backlog.is_default)}
        />
      </div>
    </div>
  );
}
