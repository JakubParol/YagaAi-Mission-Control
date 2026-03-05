"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Filter, Group, ListTodo, Loader2, Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { StoryActionsMenu } from "@/components/planning/story-actions-menu";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { STATUS_LABEL, STATUS_STYLE } from "@/components/planning/story-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { deleteStory } from "../story-actions";
import {
  buildPlanningListRows,
  COMING_SOON_LABEL,
  LIST_GROUP_OPTIONS,
  type PlanningBacklogStoryApiItem,
  type PlanningEpicApiItem,
  type PlanningListRow,
  type PlanningStoryApiItem,
  type PlanningTaskApiItem,
} from "./list-view-model";

interface PlanningBacklogApiItem {
  id: string;
}

type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; rows: PlanningListRow[] };

interface ScopedFetchResult {
  projectId: string;
  result: FetchResult;
}

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; rows: PlanningListRow[] };

interface ListEnvelope<T> {
  data?: T[];
}

const HEADER_GRID_TEMPLATE =
  "grid-cols-[116px_84px_minmax(0,1fr)_112px_72px_172px_220px_136px_44px]";

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

function ItemTypeBadge({ rowType }: { rowType: PlanningListRow["row_type"] }) {
  const Icon = rowType === "story" ? BookOpen : ListTodo;
  const label = rowType === "story" ? "Story" : "Task";
  const tone =
    rowType === "story"
      ? "bg-primary/15 text-primary border-primary/40"
      : "bg-cyan-500/10 text-cyan-300 border-cyan-400/40";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export default function PlanningListPage() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
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

  const fetchListResult = useCallback(async (projectId: string): Promise<FetchResult> => {
    const [stories, tasks, epics, backlogs] = await Promise.all([
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

    return rows.length === 0 ? { kind: "empty" } : { kind: "ok", rows };
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

  const activeSelectedStoryId =
    state.kind === "ok" &&
    selectedStoryId &&
    state.rows.some((row) => row.row_type === "story" && row.id === selectedStoryId)
      ? selectedStoryId
      : null;
  const activeSelectedTaskRow =
    state.kind === "ok" &&
    selectedTaskRow &&
    state.rows.some((row) => row.row_type === "task" && row.id === selectedTaskRow.id)
      ? selectedTaskRow
      : null;
  const selectedStoryLabels =
    state.kind === "ok" && activeSelectedStoryId
      ? state.rows.find((row) => row.row_type === "story" && row.id === activeSelectedStoryId)
          ?.labels
      : undefined;

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
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value=""
                  readOnly
                  placeholder="Search (Coming soon)"
                  aria-label="Search work items"
                  className={cn(
                    "h-8 w-full rounded-md border border-border/60 bg-background/80 pl-8 pr-3 text-sm text-muted-foreground",
                    "cursor-not-allowed",
                  )}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="gap-1.5"
                title="Coming soon"
              >
                <Filter className="size-3.5" />
                Filters
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {COMING_SOON_LABEL}
                </span>
              </Button>
              <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
                <Group className="size-3.5 text-muted-foreground" />
                <select
                  aria-label="Group work items"
                  disabled
                  className="bg-transparent text-xs text-muted-foreground outline-none"
                  value={LIST_GROUP_OPTIONS[0]}
                  onChange={() => undefined}
                >
                  {LIST_GROUP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-muted-foreground/80">{COMING_SOON_LABEL}</span>
              </div>
            </div>
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
          <header
            className={cn(
              "hidden border-b border-border/40 bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid",
              HEADER_GRID_TEMPLATE,
            )}
          >
            <span>Type</span>
            <span>Key</span>
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Epic</span>
            <span>Labels</span>
            <span>Updated</span>
            <span className="text-right">Actions</span>
          </header>

          <div className="divide-y divide-border/20">
            {state.rows.map((row) => {
              const statusStyle = STATUS_STYLE[row.status];
              const labelsText =
                row.labels.length > 0
                  ? row.labels.map((label) => label.name).join(", ")
                  : "—";
              const epicText =
                row.epic_key && row.epic_title ? `${row.epic_key} ${row.epic_title}` : "—";
              const isStoryRow = row.row_type === "story";
              const isStoryDeletePending = isStoryRow && Boolean(pendingStoryIds[row.id]);
              const openRowDetails = () => {
                if (row.row_type === "story") {
                  setSelectedStoryId(row.id);
                } else {
                  setSelectedTaskRow(row);
                }
              };

              return (
                <div
                  key={`${row.row_type}:${row.id}`}
                  role="button"
                  tabIndex={isStoryDeletePending ? -1 : 0}
                  aria-disabled={isStoryDeletePending}
                  onClick={() => {
                    if (isStoryDeletePending) return;
                    openRowDetails();
                  }}
                  onKeyDown={(event) => {
                    if (isStoryDeletePending) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRowDetails();
                    }
                  }}
                  className={cn(
                    "w-full text-left transition-colors duration-100 hover:bg-muted/25 focus-ring",
                    "px-3 py-2.5",
                    isStoryDeletePending && "cursor-progress opacity-70",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 md:hidden">
                    <ItemTypeBadge rowType={row.row_type} />
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          statusStyle.bg,
                          statusStyle.text,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
                        {STATUS_LABEL[row.status]}
                      </span>
                      {isStoryRow && (
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
                          disabled={isStoryDeletePending}
                          isDeleting={isStoryDeletePending}
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 md:hidden">
                    <p className="text-sm text-foreground">
                      {row.key ? `${row.key} · ` : ""}
                      {row.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Priority: {getPriorityLabel(row.priority)} | Epic: {epicText} | Updated:{" "}
                      {formatUpdatedAt(row.updated_at)}
                    </p>
                  </div>

                  <div className={cn("hidden items-center gap-3 md:grid", HEADER_GRID_TEMPLATE)}>
                    <ItemTypeBadge rowType={row.row_type} />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {row.key ?? "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{row.title}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {row.row_type === "story"
                          ? (row.story_type ?? "Story")
                          : (row.task_type ?? "Task")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        statusStyle.bg,
                        statusStyle.text,
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {getPriorityLabel(row.priority)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={epicText}>
                      {epicText}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={labelsText}>
                      {labelsText}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatUpdatedAt(row.updated_at)}
                    </span>
                    <div className="justify-self-end">
                      {isStoryRow && (
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
                          disabled={isStoryDeletePending}
                          isDeleting={isStoryDeletePending}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
