import { useCallback, useMemo } from "react";

import { BacklogRow, type BacklogAssigneeOption } from "@/components/planning/backlog-row";
import { BacklogRowsHeader } from "@/components/planning/backlog-rows-header";
import { EmptyState } from "@/components/empty-state";
import { StoryActionsMenu } from "@/components/planning/story-actions-menu";
import type { WorkItemStatus } from "@/lib/planning/types";

import { toBacklogRowStory, type PlanningListRow } from "./list-view-model";

export interface ListRowsSectionProps {
  rows: PlanningListRow[];
  assignableAgents: BacklogAssigneeOption[];
  pendingIds: Record<string, true>;
  onStoryClick: (storyId: string) => void;
  onTaskClick: (row: PlanningListRow) => void;
  onStoryDelete: (storyId: string) => void;
  onStoryStatusChange: (storyId: string, status: WorkItemStatus) => void;
  onRowAssigneeChange: (row: PlanningListRow, nextAssigneeAgentId: string | null) => void;
  onAddLabel: (storyId: string) => void;
}

export function ListRowsSection({
  rows,
  assignableAgents,
  pendingIds,
  onStoryClick,
  onTaskClick,
  onStoryDelete,
  onStoryStatusChange,
  onRowAssigneeChange,
  onAddLabel,
}: ListRowsSectionProps) {
  const assigneeById = useMemo(
    () => new Map(assignableAgents.map((agent) => [agent.id, agent])),
    [assignableAgents],
  );

  const handleRowClick = useCallback(
    (row: PlanningListRow) => {
      if (pendingIds[row.id]) return;
      if (row.row_type === "story") {
        onStoryClick(row.id);
      } else {
        onTaskClick(row);
      }
    },
    [pendingIds, onStoryClick, onTaskClick],
  );

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12">
        <EmptyState
          icon="default"
          title="No matching work items"
          description="No items match the active list filters. Adjust filters or clear them to see all rows."
        />
      </div>
    );
  }

  return (
    <>
      <BacklogRowsHeader />

      <div className="divide-y divide-border/20">
        {rows.map((row) => {
          const isStoryRow = row.row_type === "story";
          const isRowPending = Boolean(pendingIds[row.id]);
          const rowItem = toBacklogRowStory(row, assigneeById);

          return (
            <BacklogRow
              key={`${row.row_type}:${row.id}`}
              item={rowItem}
              assigneeOptions={assignableAgents}
              assigneePending={isRowPending}
              onAssigneeChange={(_, nextAssigneeAgentId) => {
                onRowAssigneeChange(row, nextAssigneeAgentId);
              }}
              onClick={() => handleRowClick(row)}
              actions={(
                <div className="flex items-center justify-end gap-1">
                  {isStoryRow ? (
                    <StoryActionsMenu
                      storyId={row.id}
                      storyType={row.story_type}
                      storyKey={row.key}
                      storyTitle={row.title}
                      storyStatus={row.status}
                      onDelete={onStoryDelete}
                      onStatusChange={onStoryStatusChange}
                      onAddLabel={onAddLabel}
                      disabled={isRowPending}
                      isDeleting={isRowPending}
                    />
                  ) : null}
                </div>
              )}
            />
          );
        })}
      </div>
    </>
  );
}
