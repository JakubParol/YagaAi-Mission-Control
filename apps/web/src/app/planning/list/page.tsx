"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTodo, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import {
  PlanningFilters,
  UNASSIGNED_FILTER_VALUE,
  type PlanningFiltersValue,
} from "@/components/planning/planning-filters";
import { PageShell } from "@/components/page-shell";
import { RefreshControl } from "@/components/refresh-control";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import type { WorkItemStatus } from "@/lib/planning/types";
import { deleteStory } from "../story-actions";
import type { PlanningListRow } from "./list-view-model";
import { applyPlanningListFilters } from "./list-filters";
import type { PageState, ScopedFetchResult } from "./list-types";
import { fetchListResult, patchRowAssignee, patchStoryStatus } from "./list-page-actions";
import {
  buildClearFiltersUrl,
  buildFilterUrl,
  deriveFilterOptions,
  deriveSelections,
  readFiltersFromSearchParams,
} from "./list-page-derived";
import { ListRowsSection } from "./list-rows-section";
import { TaskDetailDialog } from "./task-detail-dialog";

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

  const filters = readFiltersFromSearchParams(searchParams);

  const updateFilterParam = useCallback(
    (key: keyof PlanningFiltersValue, value: string) => {
      router.replace(buildFilterUrl(pathname, searchParams, key, value));
    },
    [pathname, router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    router.replace(buildClearFiltersUrl(pathname, searchParams));
  }, [pathname, router, searchParams]);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) {
      throw new Error("Select a single project before refreshing.");
    }
    const result = await fetchListResult(singleProjectId);
    setFetchResultState({ projectId: singleProjectId, result });
  }, [singleProjectId]);

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
        setFetchResultState({ projectId: singleProjectId, result });
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
  }, [singleProjectId]);

  const handleStoryDialogChange = useCallback((open: boolean) => {
    if (!open) setSelectedStoryId(null);
  }, []);

  const handleTaskDialogChange = useCallback((open: boolean) => {
    if (!open) setSelectedTaskRow(null);
  }, []);

  const runWithPending = useCallback(
    (id: string, action: () => Promise<void>, fallbackMsg: string) => {
      if (pendingStoryIds[id]) return;
      setPendingStoryIds((prev) => ({ ...prev, [id]: true }));
      void action()
        .then(() => refreshCurrentView())
        .catch((error) => {
          setErrorToast(error instanceof Error ? error.message : fallbackMsg);
        })
        .finally(() => {
          setPendingStoryIds((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        });
    },
    [pendingStoryIds, refreshCurrentView],
  );

  const handleStoryDelete = useCallback(
    (storyId: string) => {
      runWithPending(
        storyId,
        async () => {
          await deleteStory(storyId);
          if (selectedStoryId === storyId) setSelectedStoryId(null);
        },
        "Failed to delete story.",
      );
    },
    [runWithPending, selectedStoryId],
  );

  const handleStoryStatusChange = useCallback(
    (storyId: string, status: WorkItemStatus) => {
      runWithPending(storyId, () => patchStoryStatus(storyId, status), "Failed to update story status.");
    },
    [runWithPending],
  );

  const handleRowAssigneeChange = useCallback(
    (row: PlanningListRow, nextAssigneeAgentId: string | null) => {
      runWithPending(
        row.id,
        () => patchRowAssignee(row.row_type, row.id, nextAssigneeAgentId),
        "Failed to update assignee.",
      );
    },
    [runWithPending],
  );

  const visibleRows =
    state.kind === "ok"
      ? applyPlanningListFilters(state.rows, filters)
      : [];

  const {
    statusOptions, typeOptions, labelOptions,
    epicOptions, assigneeOptions, assignableAgents,
  } = deriveFilterOptions(state, UNASSIGNED_FILTER_VALUE);

  const { activeSelectedStoryId, activeSelectedTaskRow, selectedStoryLabels } =
    deriveSelections(state.kind, visibleRows, selectedStoryId, selectedTaskRow);

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

      <PageShell
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
          <RefreshControl
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
          <ListRowsSection
            rows={visibleRows}
            assignableAgents={assignableAgents}
            pendingIds={pendingStoryIds}
            onStoryClick={setSelectedStoryId}
            onTaskClick={setSelectedTaskRow}
            onStoryDelete={handleStoryDelete}
            onStoryStatusChange={handleStoryStatusChange}
            onRowAssigneeChange={handleRowAssigneeChange}
            onAddLabel={setSelectedStoryId}
          />
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

      <TaskDetailDialog
        row={activeSelectedTaskRow}
        open={activeSelectedTaskRow !== null}
        onOpenChange={handleTaskDialogChange}
      />
    </>
  );
}

export default function PlanningListPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <PlanningListPageContent />
    </Suspense>
  );
}
