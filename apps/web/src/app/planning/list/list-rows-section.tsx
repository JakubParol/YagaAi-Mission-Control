import { useCallback, useMemo } from "react";

import { BacklogRow, type BacklogAssigneeOption } from "@/components/planning/backlog-row";
import { BacklogRowsHeader } from "@/components/planning/backlog-rows-header";
import { EmptyState } from "@/components/empty-state";
import { StoryActionsMenu } from "@/components/planning/story-actions-menu";
import type { BacklogMembershipTarget } from "@/components/planning/story-actions-menu-types";
import type { WorkItemStatus } from "@/lib/planning/types";

import type { ListBacklogItem } from "./list-page-actions";
import { toBacklogRowStory, type PlanningListRow } from "./list-view-model";

export interface ListRowsSectionProps {
  rows: PlanningListRow[];
  assignableAgents: BacklogAssigneeOption[];
  backlogs: ListBacklogItem[];
  membershipMap: Map<string, string>;
  pendingIds: Record<string, true>;
  onWorkItemClick: (workItemId: string) => void;
  onStoryDelete: (storyId: string) => void;
  onStoryStatusChange: (storyId: string, status: WorkItemStatus) => void;
  onRowAssigneeChange: (row: PlanningListRow, nextAssigneeAgentId: string | null) => void;
  onAddLabel: (storyId: string) => void;
  onMoveToBacklog: (storyId: string, sourceBacklogId: string, targetBacklogId: string) => void;
  onLinkParent?: (storyId: string) => void;
}

export function ListRowsSection({
  rows,
  assignableAgents,
  backlogs,
  membershipMap,
  pendingIds,
  onWorkItemClick,
  onStoryDelete,
  onStoryStatusChange,
  onRowAssigneeChange,
  onAddLabel,
  onMoveToBacklog,
  onLinkParent,
}: ListRowsSectionProps) {
  const assigneeById = useMemo(
    () => new Map(assignableAgents.map((agent) => [agent.id, agent])),
    [assignableAgents],
  );

  const buildTargets = useCallback(
    (storyId: string): BacklogMembershipTarget[] => {
      const currentBacklogId = membershipMap.get(storyId) ?? "";
      return backlogs.map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        isMember: b.id === currentBacklogId,
        isCurrentBacklog: b.id === currentBacklogId,
        isActive: b.kind === "SPRINT" && b.status === "ACTIVE",
        isDefault: b.is_default,
      }));
    },
    [backlogs, membershipMap],
  );

  const handleRowClick = useCallback(
    (row: PlanningListRow) => {
      if (pendingIds[row.id]) return;
      onWorkItemClick(row.id);
    },
    [pendingIds, onWorkItemClick],
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
                      storyType={row.sub_type ?? row.type}
                      storyKey={row.key}
                      storyTitle={row.title}
                      storyStatus={row.status}
                      onDelete={onStoryDelete}
                      onStatusChange={onStoryStatusChange}
                      onAddLabel={onAddLabel}
                      onLinkParent={onLinkParent}
                      backlogMembershipActions={backlogs.length > 0 ? {
                        targets: buildTargets(row.id),
                        onMove: (sid, targetId) => {
                          const sourceId = membershipMap.get(sid) ?? "";
                          onMoveToBacklog(sid, sourceId, targetId);
                        },
                      } : undefined}
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
