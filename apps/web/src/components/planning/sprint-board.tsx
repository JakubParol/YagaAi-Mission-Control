import { useMemo, useState, type DragEvent } from "react";
import type { WorkItemStatus } from "@/lib/planning/types";
import type { StoryCardStory } from "./story-card";
import type { StoryAssigneeSelection } from "@/components/planning/story-assignee-control";
import type { QuickCreateAssigneeOption, QuickCreateSubmitInput } from "@/app/planning/board/quick-create";
import { BoardColumn } from "./sprint-board-column";

// Re-export layout constant so the test import path stays unchanged
export { TODO_QUICK_CREATE_LAYOUT } from "./sprint-board-quick-create";

// ─── Types (matches API response shape) ─────────────────────────────

export interface SprintBacklog {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ActiveSprintData {
  backlog: SprintBacklog;
  items: StoryCardStory[];
}

// ─── Column config ──────────────────────────────────────────────────

const COLUMNS: { status: WorkItemStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "Todo", accent: "border-l-slate-500" },
  { status: "IN_PROGRESS", label: "In Progress", accent: "border-l-blue-500" },
  { status: "CODE_REVIEW", label: "Code Review", accent: "border-l-violet-500" },
  { status: "VERIFY", label: "Verify", accent: "border-l-amber-500" },
  { status: "DONE", label: "Done", accent: "border-l-emerald-500" },
];

const VALID_DROP_STATUSES = new Set<WorkItemStatus>([
  "TODO",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "VERIFY",
  "DONE",
]);

// ─── Props ───────────────────────────────────────────────────────────

export interface SprintBoardProps {
  data: ActiveSprintData;
  onStoryClick?: (storyId: string) => void;
  onStoryStatusChange?: (storyId: string, status: WorkItemStatus) => void;
  onStoryAssigneeChange?: (storyId: string, assigneeAgentId: string | null) => Promise<void>;
  onStoryDelete?: (storyId: string) => Promise<void> | void;
  pendingStoryIds?: ReadonlySet<string>;
  onTodoQuickCreate?: (input: Omit<QuickCreateSubmitInput, "projectId">) => Promise<void>;
  assigneeOptions?: readonly QuickCreateAssigneeOption[];
}

// ─── Main Board ─────────────────────────────────────────────────────

export function SprintBoard({
  data,
  onStoryClick,
  onStoryStatusChange,
  onStoryAssigneeChange,
  onStoryDelete,
  pendingStoryIds,
  onTodoQuickCreate,
  assigneeOptions = [],
}: SprintBoardProps) {
  const [draggingStoryId, setDraggingStoryId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<WorkItemStatus | null>(null);
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, StoryAssigneeSelection>>({});
  const pendingSet = useMemo(() => new Set(pendingStoryIds ?? []), [pendingStoryIds]);

  const handleStoryAssigneeChange = (storyId: string, assignee: StoryAssigneeSelection) => {
    const story = data.items.find((item) => item.id === storyId);
    const previousAssignee = assigneeOverrides[storyId] ?? {
      assignee_agent_id: story?.assignee_agent_id ?? null,
      assignee_name: story?.assignee_name ?? null,
      assignee_last_name: story?.assignee_last_name ?? null,
      assignee_initials: story?.assignee_initials ?? null,
      assignee_avatar: story?.assignee_avatar ?? null,
    };
    setAssigneeOverrides((prev) => ({ ...prev, [storyId]: assignee }));
    void onStoryAssigneeChange?.(storyId, assignee.assignee_agent_id ?? null).catch(() => {
      setAssigneeOverrides((prev) => ({
        ...prev,
        [storyId]: previousAssignee,
      }));
    });
  };

  const byStatus = useMemo(() => {
    const grouped = new Map<WorkItemStatus, StoryCardStory[]>();
    for (const col of COLUMNS) {
      grouped.set(col.status, []);
    }
    for (const story of data.items) {
      const bucket = grouped.get(story.status);
      if (bucket) {
        bucket.push(story);
      }
    }
    return grouped;
  }, [data.items]);

  const handleCardDragStart = (storyId: string) => {
    setDraggingStoryId(storyId);
  };

  const handleCardDragEnd = () => {
    setDraggingStoryId(null);
    setDropTargetStatus(null);
  };

  const handleDragOver = (status: WorkItemStatus, event: DragEvent<HTMLDivElement>) => {
    if (!draggingStoryId || pendingSet.has(draggingStoryId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetStatus !== status) {
      setDropTargetStatus(status);
    }
  };

  const handleDrop = (status: WorkItemStatus, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const draggedStoryId = event.dataTransfer.getData("text/plain") || draggingStoryId;
    setDropTargetStatus(null);
    setDraggingStoryId(null);

    if (!draggedStoryId || pendingSet.has(draggedStoryId) || !VALID_DROP_STATUSES.has(status)) {
      return;
    }

    const draggedStory = data.items.find((story) => story.id === draggedStoryId);
    if (!draggedStory || draggedStory.status === status) {
      return;
    }

    onStoryStatusChange?.(draggedStoryId, status);
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 overflow-x-auto">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.status}
            status={col.status}
            label={col.label}
            accent={col.accent}
            stories={byStatus.get(col.status) ?? []}
            isDropTarget={dropTargetStatus === col.status}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onStoryClick={onStoryClick}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            pendingStoryIds={pendingSet}
            onStoryDelete={onStoryDelete}
            onStoryStatusChange={onStoryStatusChange}
            onTodoQuickCreate={col.status === "TODO" ? onTodoQuickCreate : undefined}
            assigneeOptions={assigneeOptions}
            assigneeOverrides={assigneeOverrides}
            onStoryAssigneeChange={handleStoryAssigneeChange}
          />
        ))}
      </div>
    </div>
  );
}
