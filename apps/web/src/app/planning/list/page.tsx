"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTodo, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import {
  PlanningFilters,
  PLANNING_FILTER_KEYS,
  UNASSIGNED_FILTER_VALUE,
  type PlanningFiltersValue,
} from "@/components/planning/planning-filters";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { BacklogRow, type BacklogAssigneeOption } from "@/components/planning/backlog-row";
import { BacklogRowsHeader } from "@/components/planning/backlog-rows-header";
import { StoryActionsMenu } from "@/components/planning/story-actions-menu";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { STATUS_LABEL, type StoryCardStory } from "@/components/planning/story-card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { deleteStory } from "../story-actions";
import {
  buildPlanningListRows,
  COMING_SOON_LABEL,
  type PlanningBacklogStoryApiItem,
  type PlanningEpicApiItem,
  type PlanningListLabel,
  type PlanningListRow,
  type PlanningStoryApiItem,
  type PlanningTaskApiItem,
} from "./list-view-model";
import {
  applyPlanningListFilters,
  buildStatusOptions,
  buildTypeOptions,
} from "./list-filters";

interface PlanningBacklogApiItem {
  id: string;
}

interface PlanningAgentApiItem {
  id?: string;
  name?: string;
  last_name?: string | null;
  initials?: string | null;
  role?: string | null;
  avatar?: string | null;
}

interface PlanningListAssigneeOption {
  id: string;
  label: string;
}

type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      rows: PlanningListRow[];
      epics: PlanningEpicApiItem[];
      labels: PlanningListLabel[];
      assignees: PlanningListAssigneeOption[];
      assignableAgents: BacklogAssigneeOption[];
    };

interface ScopedFetchResult {
  projectId: string;
  result: FetchResult;
}

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      rows: PlanningListRow[];
      epics: PlanningEpicApiItem[];
      labels: PlanningListLabel[];
      assignees: PlanningListAssigneeOption[];
      assignableAgents: BacklogAssigneeOption[];
    };

interface ListEnvelope<T> {
  data?: T[];
}

async function fetchList<T>(path: string): Promise<T[]> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`Failed to load list data (${response.status})`);
  }
  const body = (await response.json()) as ListEnvelope<T>;
  return body.data ?? [];
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPriorityLabel(priority: number | null): string {
  return priority === null ? "—" : String(priority);
}

function resolveAgentLabel(agent: PlanningAgentApiItem): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

function buildLabelOptions(rows: PlanningListRow[]): PlanningListLabel[] {
  const labelsById = new Map<string, PlanningListLabel>();

  for (const row of rows) {
    for (const label of row.labels) {
      if (!labelsById.has(label.id)) {
        labelsById.set(label.id, label);
      }
    }
  }

  return [...labelsById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function toBacklogRowStory(
  row: PlanningListRow,
  assigneeById: ReadonlyMap<string, BacklogAssigneeOption>,
): StoryCardStory {
  const selectedAssignee =
    row.current_assignee_agent_id ? assigneeById.get(row.current_assignee_agent_id) : null;

  return {
    id: row.id,
    key: row.key,
    title: row.title,
    status: row.status,
    priority: row.priority,
    story_type: row.story_type ?? row.task_type ?? "TASK",
    epic_key: row.epic_key,
    epic_title: row.epic_title,
    position: 0,
    task_count: row.task_count,
    done_task_count: row.done_task_count,
    labels: row.labels,
    assignee_agent_id: row.current_assignee_agent_id,
    current_assignee_agent_id: row.current_assignee_agent_id,
    assignee_name: selectedAssignee?.name ?? null,
    assignee_last_name: selectedAssignee?.last_name ?? null,
    assignee_initials: selectedAssignee?.initials ?? null,
    assignee_avatar: selectedAssignee?.avatar ?? null,
  };
}

function PlanningListPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [fetchResultState, setFetchResultState] = useState<ScopedFetchResult | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedTaskRow, setSelectedTaskRow] = useState<PlanningListRow | null>(null);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1
      ? selectedProjectIds[0]
      : null;

  const fetchResult =
    singleProjectId && fetchResultState?.projectId === singleProjectId
      ? fetchResultState.result
      : null;

  const state: PageState = !singleProjectId
    ? { kind: "no-project" }
    : fetchResult === null
      ? { kind: "loading" }
      : fetchResult;

  const filters: PlanningFiltersValue = {
    search: searchParams.get(PLANNING_FILTER_KEYS.search) ?? "",
    status: (searchParams.get(PLANNING_FILTER_KEYS.status) ?? "") as ItemStatus | "",
    type: searchParams.get(PLANNING_FILTER_KEYS.type) ?? "",
    labelId: searchParams.get(PLANNING_FILTER_KEYS.labelId) ?? "",
    epicId: searchParams.get(PLANNING_FILTER_KEYS.epicId) ?? "",
    assignee: searchParams.get(PLANNING_FILTER_KEYS.assignee) ?? "",
  };

  const updateFilterParam = useCallback(
    (key: keyof PlanningFiltersValue, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const paramKey = PLANNING_FILTER_KEYS[key];
      if (value.trim().length === 0) {
        params.delete(paramKey);
      } else {
        params.set(paramKey, value);
      }
      const queryString = params.toString();
      router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(PLANNING_FILTER_KEYS.search);
    params.delete(PLANNING_FILTER_KEYS.status);
    params.delete(PLANNING_FILTER_KEYS.type);
    params.delete(PLANNING_FILTER_KEYS.labelId);
    params.delete(PLANNING_FILTER_KEYS.epicId);
    params.delete(PLANNING_FILTER_KEYS.assignee);
    const queryString = params.toString();
    router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname);
  }, [pathname, router, searchParams]);

  const fetchListResult = useCallback(async (projectId: string): Promise<FetchResult> => {
    const [stories, tasks, epics, backlogs, agents] = await Promise.all([
      fetchList<PlanningStoryApiItem>(
        `/v1/planning/stories?project_id=${projectId}&limit=100&sort=-updated_at`,
      ),
      fetchList<PlanningTaskApiItem>(
        `/v1/planning/tasks?project_id=${projectId}&limit=100&sort=-updated_at`,
      ),
      fetchList<PlanningEpicApiItem>(
        `/v1/planning/epics?project_id=${projectId}&limit=100`,
      ),
      fetchList<PlanningBacklogApiItem>(
        `/v1/planning/backlogs?project_id=${projectId}&limit=100`,
      ),
      fetchList<PlanningAgentApiItem>(
        "/v1/planning/agents?is_active=true&limit=100&sort=name",
      ).catch(() => []),
    ]);

    const backlogStoryGroups = await Promise.all(
      backlogs.map((backlog) =>
        fetchList<PlanningBacklogStoryApiItem>(
          `/v1/planning/backlogs/${backlog.id}/stories`,
        ).catch(() => []),
      ),
    );

    const backlogStoryById = new Map<string, PlanningBacklogStoryApiItem>();
    for (const group of backlogStoryGroups) {
      for (const story of group) {
        if (!backlogStoryById.has(story.id)) {
          backlogStoryById.set(story.id, story);
        }
      }
    }

    const rows = buildPlanningListRows({
      stories,
      backlogStories: [...backlogStoryById.values()],
      standaloneTaskCandidates: tasks,
      epics,
    });

    if (rows.length === 0) {
      return { kind: "empty" };
    }

    const labels = buildLabelOptions(rows);
    const assignees = agents
      .map((agent) => {
        const label = resolveAgentLabel(agent);
        return label && agent.id ? { id: agent.id, label } : null;
      })
      .filter((value): value is PlanningListAssigneeOption => value !== null)
      .sort((a, b) => a.label.localeCompare(b.label));

    const assignableAgents = agents
      .filter((agent): agent is PlanningAgentApiItem & { id: string; name: string } => (
        typeof agent.id === "string"
        && agent.id.trim().length > 0
        && typeof agent.name === "string"
        && agent.name.trim().length > 0
      ))
      .map((agent) => ({
        id: agent.id,
        name: String(agent.name),
        last_name: agent.last_name ?? null,
        initials: agent.initials ?? null,
        role: agent.role ?? null,
        avatar: agent.avatar ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      kind: "ok",
      rows,
      epics,
      labels,
      assignees,
      assignableAgents,
    };
  }, []);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) {
      throw new Error("Select a single project before refreshing.");
    }
    const result = await fetchListResult(singleProjectId);
    setFetchResultState({
      projectId: singleProjectId,
      result,
    });
  }, [fetchListResult, singleProjectId]);

  useEffect(() => {
    if (!errorToast) return;
    const timeoutId = window.setTimeout(() => {
      setErrorToast(null);
    }, 3500);
    return () => window.clearTimeout(timeoutId);
  }, [errorToast]);

  useEffect(() => {
    if (!singleProjectId) return;

    let cancelled = false;

    void fetchListResult(singleProjectId)
      .then((result) => {
        if (cancelled) return;
        setFetchResultState({
          projectId: singleProjectId,
          result,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setFetchResultState({
          projectId: singleProjectId,
          result: {
            kind: "error",
            message:
              error instanceof Error ? error.message : "Failed to load planning list items.",
          },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchListResult, singleProjectId]);

  const handleStoryDialogChange = useCallback((open: boolean) => {
    if (!open) setSelectedStoryId(null);
  }, []);

  const handleTaskDialogChange = useCallback((open: boolean) => {
    if (!open) setSelectedTaskRow(null);
  }, []);

  const handleStoryDelete = useCallback(
    async (storyId: string) => {
      if (pendingStoryIds[storyId]) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await deleteStory(storyId);
        if (selectedStoryId === storyId) {
          setSelectedStoryId(null);
        }
        await refreshCurrentView();
      } catch (error) {
        setErrorToast(
          error instanceof Error ? error.message : "Failed to delete story.",
        );
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      }
    },
    [pendingStoryIds, refreshCurrentView, selectedStoryId],
  );

  const handleStoryStatusChange = useCallback(
    async (storyId: string, status: ItemStatus) => {
      if (pendingStoryIds[storyId]) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          throw new Error(`Failed to update story status. HTTP ${response.status}.`);
        }
        await refreshCurrentView();
      } catch (error) {
        setErrorToast(
          error instanceof Error ? error.message : "Failed to update story status.",
        );
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      }
    },
    [pendingStoryIds, refreshCurrentView],
  );

  const visibleRows =
    state.kind === "ok"
      ? applyPlanningListFilters(state.rows, {
          search: filters.search,
          status: filters.status,
          type: filters.type,
          labelId: filters.labelId,
          epicId: filters.epicId,
          assignee: filters.assignee,
        })
      : [];
  const statusOptions = state.kind === "ok" ? buildStatusOptions(state.rows) : [];
  const typeOptions = state.kind === "ok" ? buildTypeOptions(state.rows) : [];
  const labelOptions =
    state.kind === "ok"
      ? state.labels.map((label) => ({ value: label.id, label: label.name }))
      : [];
  const epicOptions =
    state.kind === "ok"
      ? state.epics.map((epic) => ({
          value: epic.id,
          label: `${epic.key} ${epic.title}`,
        }))
      : [];
  const assigneeOptions = [
    { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
    ...(state.kind === "ok"
      ? state.assignees.map((assignee) => ({
          value: assignee.id,
          label: assignee.label,
        }))
      : []),
  ];
  const assignableAgents = state.kind === "ok" ? state.assignableAgents : [];
  const assigneeById = new Map(assignableAgents.map((agent) => [agent.id, agent]));

  const activeSelectedStoryId =
    state.kind === "ok" &&
    selectedStoryId &&
    visibleRows.some((row) => row.row_type === "story" && row.id === selectedStoryId)
      ? selectedStoryId
      : null;
  const activeSelectedTaskRow =
    state.kind === "ok" &&
    selectedTaskRow &&
    visibleRows.some((row) => row.row_type === "task" && row.id === selectedTaskRow.id)
      ? selectedTaskRow
      : null;
  const selectedStoryLabels =
    state.kind === "ok" && activeSelectedStoryId
      ? visibleRows.find((row) => row.row_type === "story" && row.id === activeSelectedStoryId)
          ?.labels
      : undefined;

  const handleRowAssigneeChange = useCallback(
    async (
      row: PlanningListRow,
      nextAssigneeAgentId: string | null,
    ) => {
      if (pendingStoryIds[row.id]) return;
      setPendingStoryIds((prev) => ({ ...prev, [row.id]: true }));
      try {
        const endpoint =
          row.row_type === "story"
            ? `/v1/planning/stories/${row.id}`
            : `/v1/planning/tasks/${row.id}`;
        const response = await fetch(apiUrl(endpoint), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_assignee_agent_id: nextAssigneeAgentId }),
        });
        if (!response.ok) {
          throw new Error(`Failed to update assignee. HTTP ${response.status}.`);
        }
        await refreshCurrentView();
      } catch (error) {
        setErrorToast(error instanceof Error ? error.message : "Failed to update assignee.");
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }
    },
    [pendingStoryIds, refreshCurrentView],
  );

  return (
    <>
      {errorToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 shadow-lg"
        >
          {errorToast}
        </div>
      )}

      <PlanningTopShell
        icon={ListTodo}
        title="List"
        subtitle="Unified project view of stories and standalone tasks."
        controls={
          singleProjectId ? (
            <PlanningFilters
              value={filters}
              onChange={updateFilterParam}
              onClear={clearAllFilters}
              disabled={state.kind !== "ok"}
              statusOptions={statusOptions}
              typeOptions={typeOptions}
              labelOptions={labelOptions}
              epicOptions={epicOptions}
              assigneeOptions={assigneeOptions}
            />
          ) : null
        }
        actions={(
          <PlanningRefreshControl
            onRefresh={refreshCurrentView}
            disabled={!singleProjectId}
            className="items-stretch sm:items-end"
          />
        )}
      />

      {state.kind === "no-project" && (
        <EmptyState
          icon="default"
          title="Select a project"
          description="Choose a single project from the selector above to view the unified list."
        />
      )}

      {state.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {state.kind === "error" && (
        <EmptyState icon="default" title="Failed to load list view" description={state.message} />
      )}

      {state.kind === "empty" && (
        <EmptyState
          icon="default"
          title="No work items"
          description="This project has no stories or standalone tasks to display."
        />
      )}

      {state.kind === "ok" && (
        <section className="overflow-hidden rounded-lg border border-border/60 bg-card/20">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-12">
              <EmptyState
                icon="default"
                title="No matching work items"
                description="No items match the active list filters. Adjust filters or clear them to see all rows."
              />
            </div>
          ) : (
            <>
              <BacklogRowsHeader />

              <div className="divide-y divide-border/20">
                {visibleRows.map((row) => {
                  const isStoryRow = row.row_type === "story";
                  const isRowPending = Boolean(pendingStoryIds[row.id]);
                  const rowItem = toBacklogRowStory(row, assigneeById);

                  return (
                    <BacklogRow
                      key={`${row.row_type}:${row.id}`}
                      item={rowItem}
                      assigneeOptions={assignableAgents}
                      assigneePending={isRowPending}
                      onAssigneeChange={(_, nextAssigneeAgentId) => {
                        void handleRowAssigneeChange(row, nextAssigneeAgentId);
                      }}
                      onClick={() => {
                        if (isRowPending) return;
                        if (row.row_type === "story") {
                          setSelectedStoryId(row.id);
                        } else {
                          setSelectedTaskRow(row);
                        }
                      }}
                      actions={(
                        <div className="flex items-center justify-end gap-1">
                          {isStoryRow ? (
                            <StoryActionsMenu
                              storyId={row.id}
                              storyType={row.story_type}
                              storyKey={row.key}
                              storyTitle={row.title}
                              storyStatus={row.status}
                              onDelete={handleStoryDelete}
                              onStatusChange={handleStoryStatusChange}
                              onAddLabel={(storyId) => {
                                setSelectedStoryId(storyId);
                              }}
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
          )}
        </section>
      )}

      <StoryDetailDialog
        storyId={activeSelectedStoryId}
        open={activeSelectedStoryId !== null}
        onOpenChange={handleStoryDialogChange}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={() => {
          void refreshCurrentView().catch(() => undefined);
        }}
      />

      <Dialog open={activeSelectedTaskRow !== null} onOpenChange={handleTaskDialogChange}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{activeSelectedTaskRow?.title ?? "Task details"}</DialogTitle>
          </DialogHeader>
          {activeSelectedTaskRow && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{activeSelectedTaskRow.key ?? "No key"}</Badge>
                <Badge variant="secondary">{STATUS_LABEL[activeSelectedTaskRow.status]}</Badge>
                <Badge variant="outline">{activeSelectedTaskRow.task_type ?? "Task"}</Badge>
              </div>
              <p className="text-muted-foreground">
                {activeSelectedTaskRow.objective?.trim()
                  ? activeSelectedTaskRow.objective
                  : "No task objective provided."}
              </p>
              <p className="text-xs text-muted-foreground">
                Priority: {getPriorityLabel(activeSelectedTaskRow.priority)} | Updated:{" "}
                {formatUpdatedAt(activeSelectedTaskRow.updated_at)}
              </p>
              <p className="text-xs text-amber-300">
                Read-only preview. Full standalone task detail is {COMING_SOON_LABEL.toLowerCase()}
                .
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PlanningListPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <PlanningListPageContent />
    </Suspense>
  );
}
