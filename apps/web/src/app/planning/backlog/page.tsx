"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers, Loader2, Plus } from "lucide-react";

import type { ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import { PlanningFilters, type PlanningFiltersValue } from "@/components/planning/planning-filters";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import type { BacklogEditItem } from "@/components/planning/backlog-edit-dialog";
import { Button } from "@/components/ui/button";
import { deleteStory } from "../story-actions";
import { addStoryToActiveSprint, removeStoryFromActiveSprint } from "../sprint-membership-actions";
import { completeSprint, startSprint, type SprintLifecycleOperation } from "../sprint-lifecycle-actions";
import { emitSprintLifecycleChanged } from "../sprint-lifecycle-events";
import { deleteBoard } from "./board-actions";

import type {
  DeleteBoardDialogState, PageState, ScopedFetchResult,
  SprintCompleteConfirmDialogState, SprintCompleteDialogState, SprintStartDialogState,
} from "./backlog-types";
import { BacklogSection } from "./backlog-section";
import { fetchBacklogData, moveOpenStoriesToTarget, patchStoryStatus, patchStoryAssignee, swapBoardOrder } from "./backlog-page-actions";
import { BacklogPageDialogs } from "./backlog-page-dialogs";
import {
  readFiltersFromSearchParams, buildFilterUrl, buildClearFiltersUrl,
  computeFilteredSections, buildBacklogFilterOptions, getAssignableAgents,
  computeWorkItemStats, hasAnyActiveSprint, findDefaultBacklogId,
  computeCompleteDialogTargets, resolveActiveSelectedStoryId, resolveSelectedStoryLabels,
  removePendingId, computeBoardSwapTarget, prepareSprintCompletion, buildEditBoardItem,
} from "./backlog-page-derived";

// ─── Page ────────────────────────────────────────────────────────────

function BacklogPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [fetchResultState, setFetchResultState] = useState<ScopedFetchResult | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [pendingDeleteStoryIds, setPendingDeleteStoryIds] = useState<Record<string, true>>({});
  const [pendingSprintIds, setPendingSprintIds] = useState<Record<string, true>>({});
  const [pendingBoardIds, setPendingBoardIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [createBacklogId, setCreateBacklogId] = useState<string | null>(null);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [startDialog, setStartDialog] = useState<SprintStartDialogState | null>(null);
  const [completeConfirmDialog, setCompleteConfirmDialog] = useState<SprintCompleteConfirmDialogState | null>(null);
  const [completeDialog, setCompleteDialog] = useState<SprintCompleteDialogState | null>(null);
  const [completeTargetBacklogId, setCompleteTargetBacklogId] = useState<string>("");
  const [completeDialogError, setCompleteDialogError] = useState<string | null>(null);
  const [deleteBoardDialog, setDeleteBoardDialog] = useState<DeleteBoardDialogState | null>(null);
  const [editBoardBacklog, setEditBoardBacklog] = useState<BacklogEditItem | null>(null);

  const showErrorToast = useCallback((msg: string) => setErrorToast(msg), []);

  useEffect(() => {
    if (!errorToast) return;
    const id = window.setTimeout(() => setErrorToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [errorToast]);

  const singleProjectId = !allSelected && selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;
  const fetchResult = singleProjectId && fetchResultState?.projectId === singleProjectId ? fetchResultState.result : null;
  const state: PageState = useMemo(
    () => (!singleProjectId ? { kind: "no-project" } : fetchResult === null ? { kind: "loading" } : fetchResult),
    [fetchResult, singleProjectId],
  );

  // ── Derived state (pure) ──────────────────────────────────────────

  const filters = readFiltersFromSearchParams(searchParams);
  const filteredSections = computeFilteredSections(state, filters);
  const filterOptions = buildBacklogFilterOptions(state);
  const assignableAgents = getAssignableAgents(state);
  const stats = computeWorkItemStats(state, filteredSections);
  const anyActiveSprint = hasAnyActiveSprint(state);
  const defaultBacklogId = findDefaultBacklogId(state);
  const completeDialogTargetOptions = useMemo(
    () => computeCompleteDialogTargets(state, completeDialog?.backlogId ?? null),
    [completeDialog, state],
  );
  const activeSelectedStoryId = resolveActiveSelectedStoryId(state, selectedStoryId);
  const selectedStoryLabels = resolveSelectedStoryLabels(state, activeSelectedStoryId);

  const updateFilterParam = useCallback(
    (key: keyof PlanningFiltersValue, value: string) => router.replace(buildFilterUrl(pathname, searchParams, key, value)),
    [pathname, router, searchParams],
  );
  const clearAllFilters = useCallback(
    () => router.replace(buildClearFiltersUrl(pathname, searchParams)),
    [pathname, router, searchParams],
  );

  // ── Data fetching ─────────────────────────────────────────────────

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) throw new Error("Select a single project before refreshing.");
    const result = await fetchBacklogData(singleProjectId);
    setFetchResultState({ projectId: singleProjectId, result });
  }, [singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    let cancelled = false;
    void fetchBacklogData(singleProjectId)
      .then((r) => { if (!cancelled) setFetchResultState({ projectId: singleProjectId, result: r }); })
      .catch((e) => { if (!cancelled) setFetchResultState({ projectId: singleProjectId, result: { kind: "error", message: String(e) } }); });
    return () => { cancelled = true; };
  }, [singleProjectId]);

  const safeRefresh = useCallback(
    () => void refreshCurrentView().catch((e) => showErrorToast(e instanceof Error ? e.message : "Failed to refresh backlog data.")),
    [refreshCurrentView, showErrorToast],
  );

  // ── Callbacks ─────────────────────────────────────────────────────

  const withPendingStory = useCallback(
    async (storyId: string, ids: Record<string, true>, setIds: React.Dispatch<React.SetStateAction<Record<string, true>>>, fn: () => Promise<void>) => {
      if (ids[storyId]) return;
      setIds((prev) => ({ ...prev, [storyId]: true }));
      try { await fn(); } catch (error) { showErrorToast(error instanceof Error ? error.message : "Operation failed."); }
      finally { setIds((prev) => removePendingId(prev, storyId)); }
    },
    [showErrorToast],
  );

  const handleStoryDelete = useCallback(
    (storyId: string) => void withPendingStory(storyId, pendingDeleteStoryIds, setPendingDeleteStoryIds, async () => {
      await deleteStory(storyId);
      if (selectedStoryId === storyId) setSelectedStoryId(null);
      await refreshCurrentView();
    }),
    [pendingDeleteStoryIds, refreshCurrentView, selectedStoryId, withPendingStory],
  );

  const handleStoryStatusChange = useCallback(
    (storyId: string, status: ItemStatus) => void withPendingStory(storyId, { ...pendingStoryIds, ...pendingDeleteStoryIds }, setPendingStoryIds, async () => {
      await patchStoryStatus(storyId, status); await refreshCurrentView();
    }),
    [pendingDeleteStoryIds, pendingStoryIds, refreshCurrentView, withPendingStory],
  );

  const handleStoryAssigneeChange = useCallback(
    (storyId: string, nextId: string | null) => void withPendingStory(storyId, { ...pendingStoryIds, ...pendingDeleteStoryIds }, setPendingStoryIds, async () => {
      await patchStoryAssignee(storyId, nextId); await refreshCurrentView();
    }),
    [pendingDeleteStoryIds, pendingStoryIds, refreshCurrentView, withPendingStory],
  );

  const updateSprintMembership = useCallback(
    async (storyId: string, op: "add" | "remove") => {
      if (!singleProjectId) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        if (op === "add") await addStoryToActiveSprint(singleProjectId, storyId);
        else await removeStoryFromActiveSprint(singleProjectId, storyId);
        await refreshCurrentView();
      } catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to update sprint membership."); }
      finally { setPendingStoryIds((prev) => removePendingId(prev, storyId)); }
    },
    [refreshCurrentView, showErrorToast, singleProjectId],
  );

  const updateSprintLifecycle = useCallback(
    async (backlogId: string, op: SprintLifecycleOperation) => {
      if (!singleProjectId) return;
      setPendingSprintIds((prev) => ({ ...prev, [backlogId]: true }));
      try {
        if (op === "start") await startSprint(singleProjectId, backlogId);
        else await completeSprint(singleProjectId, backlogId);
        emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId, operation: op });
        await refreshCurrentView();
      } catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to update sprint status."); }
      finally { setPendingSprintIds((prev) => removePendingId(prev, backlogId)); }
    },
    [refreshCurrentView, showErrorToast, singleProjectId],
  );

  const handleCompleteSprint = useCallback(
    (backlogId: string, backlogName: string) => {
      const result = prepareSprintCompletion(state, backlogId, backlogName);
      if (result.outcome === "error") { showErrorToast(result.message); return; }
      if (result.outcome === "no-open-stories") { setCompleteConfirmDialog({ backlogId, backlogName }); return; }
      setCompleteDialog(result.dialog);
      setCompleteTargetBacklogId(result.defaultTargetId);
      setCompleteDialogError(null);
    },
    [showErrorToast, state],
  );

  const handleCompleteDialogConfirm = useCallback(async () => {
    if (!completeDialog || !singleProjectId || !defaultBacklogId) return;
    if (!completeTargetBacklogId) { setCompleteDialogError("Select where open work items should be moved."); return; }
    if (!completeDialogTargetOptions.some((b) => b.id === completeTargetBacklogId)) { setCompleteDialogError("Selected target board is no longer available. Refresh and try again."); return; }
    setCompleteDialogError(null);
    setPendingSprintIds((prev) => ({ ...prev, [completeDialog.backlogId]: true }));
    try {
      await moveOpenStoriesToTarget(singleProjectId, completeDialog.backlogId, completeTargetBacklogId, defaultBacklogId, completeDialog.openStories);
      await completeSprint(singleProjectId, completeDialog.backlogId);
      emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId: completeDialog.backlogId, operation: "complete" });
      setCompleteDialog(null); setCompleteTargetBacklogId(""); await refreshCurrentView();
    } catch (error) { setCompleteDialogError(error instanceof Error ? error.message : "Failed to complete sprint."); }
    finally { setPendingSprintIds((prev) => removePendingId(prev, completeDialog.backlogId)); }
  }, [completeDialog, completeDialogTargetOptions, completeTargetBacklogId, defaultBacklogId, refreshCurrentView, singleProjectId]);

  const handleMoveBoard = useCallback(
    async (backlogId: string, direction: "top" | "up" | "down" | "bottom") => {
      const swap = computeBoardSwapTarget(state, backlogId, direction);
      if (!swap) return;
      setPendingBoardIds((prev) => ({ ...prev, [backlogId]: true }));
      try { await swapBoardOrder(swap.currentId, swap.swapWithId, swap.currentOrder, swap.swapWithOrder); await refreshCurrentView(); }
      catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to reorder board."); }
      finally { setPendingBoardIds((prev) => removePendingId(prev, backlogId)); }
    },
    [refreshCurrentView, showErrorToast, state],
  );

  const handleDeleteBoardConfirm = useCallback(async () => {
    if (!deleteBoardDialog) return;
    setPendingBoardIds((prev) => ({ ...prev, [deleteBoardDialog.backlogId]: true }));
    try { await deleteBoard(deleteBoardDialog.backlogId); setDeleteBoardDialog(null); await refreshCurrentView(); }
    catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to delete board."); }
    finally { setPendingBoardIds((prev) => removePendingId(prev, deleteBoardDialog.backlogId)); }
  }, [deleteBoardDialog, refreshCurrentView, showErrorToast]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      {errorToast && (
        <div role="status" aria-live="polite" className="fixed right-4 top-4 z-50 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 shadow-lg">
          {errorToast}
        </div>
      )}

      <PlanningTopShell
        icon={Layers}
        title="Backlog"
        subtitle="All backlogs and their stories for the selected project."
        controls={singleProjectId ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <PlanningFilters value={filters} onChange={updateFilterParam} onClear={clearAllFilters} disabled={state.kind !== "ok"} statusOptions={filterOptions.statusOptions} typeOptions={filterOptions.typeOptions} labelOptions={filterOptions.labelOptions} epicOptions={filterOptions.epicOptions} assigneeOptions={filterOptions.assigneeOptions} className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setCreateBoardOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              Create board
            </Button>
          </div>
        ) : null}
        actions={<PlanningRefreshControl onRefresh={refreshCurrentView} disabled={!singleProjectId} className="items-stretch sm:items-end" />}
      />

      {state.kind === "no-project" && <EmptyState icon="backlog" title="Select a project" description="Choose a single project from the selector above to view its backlogs." />}
      {state.kind === "loading" && <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
      {state.kind === "empty" && <EmptyState icon="backlog" title="No backlogs" description="This project has no backlogs yet. Create a backlog or sprint to get started." />}
      {state.kind === "error" && <EmptyState icon="default" title="Failed to load backlogs" description={state.message} />}

      {state.kind === "ok" && (
        <div className="flex flex-col gap-3">
          {filteredSections.map((section) => (
            <BacklogSection
              key={section.backlog.id}
              section={section}
              isActiveSprint={section.backlog.kind === "SPRINT" && section.backlog.status === "ACTIVE"}
              hasAnyActiveSprint={anyActiveSprint}
              siblingBacklogs={state.sections.map((s) => s.backlog)}
              assigneeOptions={assignableAgents}
              onStoryClick={setSelectedStoryId}
              onStoryAssigneeChange={handleStoryAssigneeChange}
              onAddToActiveSprint={(id) => void updateSprintMembership(id, "add")}
              onRemoveFromActiveSprint={(id) => void updateSprintMembership(id, "remove")}
              onStartSprint={(id, name) => setStartDialog({ backlogId: id, backlogName: name })}
              onCompleteSprint={handleCompleteSprint}
              onCreateStory={setCreateBacklogId}
              onStoryDelete={handleStoryDelete}
              onStoryStatusChange={handleStoryStatusChange}
              onEditBoard={(id) => { const item = buildEditBoardItem(state, id); if (item) setEditBoardBacklog(item); }}
              onDeleteBoard={(id, name, isDefault) => { if (isDefault) { showErrorToast("Default board cannot be deleted."); return; } setDeleteBoardDialog({ backlogId: id, backlogName: name }); }}
              onMoveBoard={handleMoveBoard}
              pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
              pendingDeleteStoryIds={new Set(Object.keys(pendingDeleteStoryIds))}
              pendingSprintIds={new Set(Object.keys(pendingSprintIds))}
              pendingBoardIds={new Set(Object.keys(pendingBoardIds))}
            />
          ))}
          <div className="mt-1 rounded-md border border-border/40 bg-card/20 px-3 py-2 text-xs text-muted-foreground">
            {stats.visible} of {stats.total} work items visible | Estimate: - of -
          </div>
        </div>
      )}

      <BacklogPageDialogs
        singleProjectId={singleProjectId}
        pendingSprintIds={pendingSprintIds}
        pendingBoardIds={pendingBoardIds}
        startDialog={startDialog}
        completeConfirmDialog={completeConfirmDialog}
        completeDialog={completeDialog}
        completeTargetBacklogId={completeTargetBacklogId}
        completeDialogTargetOptions={completeDialogTargetOptions}
        completeDialogError={completeDialogError}
        deleteBoardDialog={deleteBoardDialog}
        createBoardOpen={createBoardOpen}
        activeSelectedStoryId={activeSelectedStoryId}
        selectedStoryLabels={selectedStoryLabels}
        editBoardBacklog={editBoardBacklog}
        createBacklogId={createBacklogId}
        onStartDialogChange={(open) => { if (!open) setStartDialog(null); }}
        onStartDialogConfirm={() => { if (startDialog) { void updateSprintLifecycle(startDialog.backlogId, "start"); setStartDialog(null); } }}
        onCompleteConfirmDialogChange={(open) => { if (!open) setCompleteConfirmDialog(null); }}
        onCompleteConfirmDialogConfirm={() => { if (completeConfirmDialog) { void updateSprintLifecycle(completeConfirmDialog.backlogId, "complete"); setCompleteConfirmDialog(null); } }}
        onCompleteDialogChange={(open) => { if (!open) { setCompleteDialog(null); setCompleteTargetBacklogId(""); setCompleteDialogError(null); } }}
        onCompleteDialogConfirm={() => void handleCompleteDialogConfirm()}
        onCompleteTargetChange={setCompleteTargetBacklogId}
        onClearCompleteError={() => setCompleteDialogError(null)}
        onDeleteBoardDialogChange={(open) => { if (!open) setDeleteBoardDialog(null); }}
        onDeleteBoardConfirm={() => void handleDeleteBoardConfirm()}
        onCreateBoardOpenChange={setCreateBoardOpen}
        onBoardCreated={safeRefresh}
        onSelectedStoryChange={(open) => { if (!open) setSelectedStoryId(null); }}
        onStoryUpdated={safeRefresh}
        onEditBoardChange={(open) => { if (!open) setEditBoardBacklog(null); }}
        onEditBoardSaved={() => { setEditBoardBacklog(null); safeRefresh(); }}
        onCreateBacklogChange={(open) => { if (!open) setCreateBacklogId(null); }}
        onCreateStorySaved={() => { setCreateBacklogId(null); safeRefresh(); }}
        onCreateStoryCancel={() => setCreateBacklogId(null)}
      />
    </>
  );
}

export default function BacklogPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <BacklogPageContent />
    </Suspense>
  );
}
