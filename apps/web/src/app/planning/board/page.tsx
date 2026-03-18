"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Target } from "lucide-react";

import type { WorkItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { PlanningFilters, type PlanningFiltersValue } from "@/components/planning/planning-filters";
import { PageShell } from "@/components/page-shell";
import { RefreshControl } from "@/components/refresh-control";
import { EmptyState } from "@/components/empty-state";
import { SprintBoard, type DropPlacement } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { deleteStory } from "../story-actions";
import { createTodoQuickItem, type QuickCreateAssigneeOption, type QuickCreateSubmitInput } from "./quick-create";
import { applyOptimisticStoryStatus, rollbackStoryStatus } from "./status-updates";
import { subscribeToSprintLifecycleChanged } from "../sprint-lifecycle-events";
import {
  fetchBoardState,
  fetchAssigneeOptions,
  patchStoryStatus,
  patchStoryAssignee,
  patchStoryRank,
  type BoardState,
} from "./board-page-actions";
import {
  applyBoardFilters,
  applyOptimisticStoryRank,
  buildBoardFilterOptions,
  buildClearFiltersUrl,
  buildFilterUrl,
  computeBoardSummary,
  computeReorderRank,
  deriveViewState,
  enrichCreatedStory,
  findSelectedStoryLabels,
  insertCreatedStory,
  readFiltersFromSearchParams,
  removePendingId,
} from "./board-page-derived";

function BoardPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<BoardState>({ kind: "no-project" });
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [assigneeOptions, setAssigneeOptions] = useState<QuickCreateAssigneeOption[]>([]);

  useEffect(() => {
    if (!errorToast) return;
    const timeoutId = window.setTimeout(() => setErrorToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [errorToast]);

  const { singleProjectId, viewState } = deriveViewState(allSelected, selectedProjectIds, state);
  const filters = readFiltersFromSearchParams(searchParams);
  const visibleState = applyBoardFilters(viewState, filters);
  const filterOptions = buildBoardFilterOptions(viewState, assigneeOptions);
  const boardSummary = computeBoardSummary(visibleState);
  const selectedStoryLabels = findSelectedStoryLabels(state, selectedStoryId);

  const updateFilterParam = useCallback(
    (key: keyof PlanningFiltersValue, value: string) => {
      router.replace(buildFilterUrl(pathname, searchParams, key, value));
    },
    [pathname, router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    router.replace(buildClearFiltersUrl(pathname, searchParams));
  }, [pathname, router, searchParams]);

  const loadBoardState = useCallback(async (projectId: string): Promise<BoardState> => {
    setPendingStoryIds({});
    return fetchBoardState(projectId);
  }, []);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) {
      throw new Error("Select a single project before refreshing.");
    }
    const nextState = await loadBoardState(singleProjectId);
    setState(nextState);
  }, [loadBoardState, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    let cancelled = false;
    void loadBoardState(singleProjectId)
      .then((nextState) => { if (!cancelled) setState(nextState); })
      .catch((error) => {
        if (!cancelled) setState({ kind: "error", projectId: singleProjectId, message: String(error) });
      });
    return () => { cancelled = true; };
  }, [loadBoardState, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) { setAssigneeOptions([]); return; }
    let cancelled = false;
    fetchAssigneeOptions()
      .then((parsed) => { if (!cancelled) setAssigneeOptions(parsed); })
      .catch(() => { if (!cancelled) setAssigneeOptions([]); });
    return () => { cancelled = true; };
  }, [singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    return subscribeToSprintLifecycleChanged((payload) => {
      if (payload.projectId !== singleProjectId) return;
      void refreshCurrentView().catch(() => undefined);
    });
  }, [refreshCurrentView, singleProjectId]);

  const handleStoryStatusChange = useCallback(
    async (storyId: string, nextStatus: WorkItemStatus, placement?: DropPlacement | null) => {
      if (state.kind !== "ok") return;
      const existingStory = state.data.items.find((item) => item.id === storyId);
      if (!existingStory || existingStory.status === nextStatus) return;
      const previousStatus: WorkItemStatus = existingStory.status;
      const previousRank = existingStory.rank;
      const backlogId = state.data.backlog.id;

      // Compute a new rank when the drop landed at a specific position in the target column.
      const newRank = placement
        ? computeReorderRank(state.data.items, storyId, placement.beforeId, placement.afterId)
        : null;

      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        const statusResult = applyOptimisticStoryStatus(prev.data, storyId, nextStatus);
        if (!statusResult.previousStatus) return prev;
        const afterStatus: BoardState = { ...prev, data: statusResult.data };
        return newRank ? applyOptimisticStoryRank(afterStatus, storyId, newRank) : afterStatus;
      });
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        const tasks: Promise<void>[] = [patchStoryStatus(storyId, nextStatus)];
        if (newRank) {
          tasks.push(patchStoryRank(backlogId, storyId, newRank));
        }
        await Promise.all(tasks);
      } catch {
        setState((prev) => {
          if (prev.kind !== "ok") return prev;
          const withRestoredRank = newRank ? applyOptimisticStoryRank(prev, storyId, previousRank) : prev;
          if (withRestoredRank.kind !== "ok") return withRestoredRank;
          return { ...withRestoredRank, data: rollbackStoryStatus(withRestoredRank.data, storyId, previousStatus) };
        });
        setErrorToast("Failed to update story status. Changes were rolled back.");
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [setErrorToast, state],
  );

  const handleStoryReorder = useCallback(
    async (storyId: string, beforeId: string | null, afterId: string | null) => {
      if (state.kind !== "ok") return;
      const existingStory = state.data.items.find((item) => item.id === storyId);
      if (!existingStory) return;

      const newRank = computeReorderRank(state.data.items, storyId, beforeId, afterId);
      if (newRank === null) return; // no-op: dropped onto itself

      const previousRank = existingStory.rank;
      const backlogId = state.data.backlog.id;

      setState((prev) => applyOptimisticStoryRank(prev, storyId, newRank));
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await patchStoryRank(backlogId, storyId, newRank);
      } catch {
        setState((prev) => applyOptimisticStoryRank(prev, storyId, previousRank));
        setErrorToast("Failed to reorder story. Changes were rolled back.");
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [state],
  );

  const handleTodoQuickCreate = useCallback(
    async (input: Omit<QuickCreateSubmitInput, "projectId">) => {
      if (!singleProjectId) {
        throw new Error("Select a single project before creating work.");
      }
      const created = await createTodoQuickItem({ ...input, projectId: singleProjectId });
      const enriched = enrichCreatedStory(created, input.assigneeAgentId, assigneeOptions);
      setState((prev) => insertCreatedStory(prev, singleProjectId, enriched));
    },
    [assigneeOptions, singleProjectId],
  );

  const handleStoryDelete = useCallback(
    async (storyId: string) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;
      const projectId = state.projectId;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        await deleteStory(storyId);
        if (selectedStoryId === storyId) setSelectedStoryId(null);
        const nextState = await loadBoardState(projectId);
        setState(nextState);
      } catch (error) {
        setErrorToast(error instanceof Error ? error.message : "Failed to delete story.");
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [loadBoardState, pendingStoryIds, selectedStoryId, setErrorToast, state],
  );

  const handleStoryAssigneeChange = useCallback(
    async (storyId: string, assigneeAgentId: string | null) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        await patchStoryAssignee(storyId, assigneeAgentId);
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [pendingStoryIds, state.kind],
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

      <PageShell
        icon={Target}
        title={boardSummary?.sprintName ?? "Board"}
        subtitle="Active sprint board for the selected project."
        controls={
          singleProjectId ? (
            <PlanningFilters
              value={filters}
              onChange={updateFilterParam}
              onClear={clearAllFilters}
              disabled={visibleState.kind !== "ok"}
              statusOptions={filterOptions.statusOptions}
              typeOptions={filterOptions.typeOptions}
              labelOptions={filterOptions.labelOptions}
              epicOptions={filterOptions.epicOptions}
              assigneeOptions={filterOptions.assigneeFilterOptions}
            />
          ) : null
        }
        actions={(
          <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
            <RefreshControl
              onRefresh={refreshCurrentView}
              disabled={!singleProjectId}
              className="items-stretch sm:items-end"
            />
            {boardSummary ? (
              <div className="flex flex-wrap justify-end gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  {boardSummary.done}/{boardSummary.total} done ({boardSummary.pctDone}%)
                </span>
              </div>
            ) : null}
          </div>
        )}
      />

      {visibleState.kind === "no-project" && (
        <EmptyState icon="board" title="Select a project" description="Choose a single project from the selector above to view its active sprint board." />
      )}
      {visibleState.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {visibleState.kind === "no-sprint" && (
        <EmptyState icon="board" title="No active sprint" description="This project has no active sprint. Create a sprint and set it to ACTIVE to see stories on the board." />
      )}
      {visibleState.kind === "error" && (
        <EmptyState icon="default" title="Failed to load sprint" description={visibleState.message} />
      )}
      {visibleState.kind === "ok" && (
        <SprintBoard
          data={visibleState.data}
          onStoryClick={setSelectedStoryId}
          onStoryStatusChange={handleStoryStatusChange}
          onStoryReorder={handleStoryReorder}
          onStoryAssigneeChange={handleStoryAssigneeChange}
          onStoryDelete={handleStoryDelete}
          pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
          onTodoQuickCreate={handleTodoQuickCreate}
          assigneeOptions={assigneeOptions}
        />
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={(open) => { if (!open) setSelectedStoryId(null); }}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={() => { void refreshCurrentView().catch(() => undefined); }}
      />
    </>
  );
}

export default function BoardPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <BoardPageContent />
    </Suspense>
  );
}
