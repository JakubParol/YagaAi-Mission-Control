"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Target } from "lucide-react";

import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { PlanningCreateAction } from "@/components/planning/planning-create-action";
import { PlanningFilters, type PlanningFiltersValue } from "@/components/planning/planning-filters";
import { PageShell } from "@/components/page-shell";
import { RefreshControl } from "@/components/refresh-control";
import { EmptyState } from "@/components/empty-state";
import { SprintBoard } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { type QuickCreateAssigneeOption } from "./quick-create";
import { subscribeToSprintLifecycleChanged } from "../sprint-lifecycle-events";
import {
  fetchBoardState,
  fetchAssigneeOptions,
  type BoardState,
} from "./board-page-actions";
import {
  applyBoardFilters,
  buildBoardFilterOptions,
  buildClearFiltersUrl,
  buildFilterUrl,
  computeBoardSummary,
  deriveViewState,
  findSelectedStoryLabels,
  hasActiveFilters,
  readFiltersFromSearchParams,
} from "./board-page-derived";
import { useBoardCallbacks } from "./board-page-callbacks";

function BoardPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<BoardState>({ kind: "no-project" });
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [assigneeOptionsState, setAssigneeOptionsState] = useState<{
    projectId: string | null;
    options: QuickCreateAssigneeOption[];
  }>({ projectId: null, options: [] });

  useEffect(() => {
    if (!errorToast) return;
    const timeoutId = window.setTimeout(() => setErrorToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [errorToast]);

  const { singleProjectId, viewState } = deriveViewState(allSelected, selectedProjectIds, state);
  const filters = readFiltersFromSearchParams(searchParams);
  const visibleState = applyBoardFilters(viewState, filters);
  const filtersActive = hasActiveFilters(filters);
  const effectiveAssigneeOptions =
    singleProjectId && assigneeOptionsState.projectId === singleProjectId
      ? assigneeOptionsState.options
      : [];
  const filterOptions = buildBoardFilterOptions(viewState, effectiveAssigneeOptions);
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

  const loadBoardState = useCallback(
    (projectId: string): Promise<BoardState> => fetchBoardState(projectId),
    [],
  );

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
      .then((nextState) => { if (!cancelled) { setPendingStoryIds({}); setState(nextState); } })
      .catch((error) => {
        if (!cancelled) setState({ kind: "error", projectId: singleProjectId, message: String(error) });
      });
    return () => { cancelled = true; };
  }, [loadBoardState, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    const reqProjectId = singleProjectId;
    let cancelled = false;
    fetchAssigneeOptions()
      .then((parsed) => { if (!cancelled) setAssigneeOptionsState({ projectId: reqProjectId, options: parsed }); })
      .catch(() => { if (!cancelled) setAssigneeOptionsState({ projectId: reqProjectId, options: [] }); });
    return () => { cancelled = true; };
  }, [singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    return subscribeToSprintLifecycleChanged((payload) => {
      if (payload.projectId !== singleProjectId) return;
      void refreshCurrentView().catch(() => undefined);
    });
  }, [refreshCurrentView, singleProjectId]);

  const {
    handleStoryStatusChange,
    handleStoryReorder,
    handleTodoQuickCreate,
    handleStoryDelete,
    handleStoryAssigneeChange,
  } = useBoardCallbacks({
    state, setState, setPendingStoryIds, pendingStoryIds,
    setErrorToast, selectedStoryId, setSelectedStoryId,
    assigneeOptions: effectiveAssigneeOptions, singleProjectId, refreshCurrentView, loadBoardState,
  });

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
        accent="primary"
        controls={
          singleProjectId ? (
            <PlanningFilters
              value={filters}
              onChange={updateFilterParam}
              onClear={clearAllFilters}
              searchPlaceholder="Search..."
              disabled={visibleState.kind !== "ok"}
              statusOptions={filterOptions.statusOptions}
              typeOptions={filterOptions.typeOptions}
              labelOptions={filterOptions.labelOptions}
              epicOptions={filterOptions.epicOptions}
              assigneeOptions={filterOptions.assigneeFilterOptions}
              trailingAction={
                <PlanningCreateAction
                  projectId={singleProjectId}
                  backlogId={state.kind === "ok" ? state.data.backlog.id : undefined}
                  disabled={visibleState.kind !== "ok"}
                  onSaved={() => void refreshCurrentView().catch(() => undefined)}
                />
              }
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
          onStoryStatusChange={filtersActive ? undefined : handleStoryStatusChange}
          onStoryReorder={filtersActive ? undefined : handleStoryReorder}
          onStoryAssigneeChange={handleStoryAssigneeChange}
          onStoryDelete={handleStoryDelete}
          pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
          onTodoQuickCreate={handleTodoQuickCreate}
          assigneeOptions={effectiveAssigneeOptions}
          dragDisabled={filtersActive}
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
