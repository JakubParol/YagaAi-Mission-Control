"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Layers,
  Loader2,
  Plus,
} from "lucide-react";

import type { ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import {
  applyPlanningStoryFilters,
  buildStoryEpicOptions,
  buildStoryLabelOptions,
  buildStoryStatusOptions,
  buildStoryTypeOptions,
  PlanningFilters,
  PLANNING_FILTER_KEYS,
  UNASSIGNED_FILTER_VALUE,
  type PlanningFiltersValue,
} from "@/components/planning/planning-filters";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import {
  BacklogEditDialog,
  type BacklogEditItem,
} from "@/components/planning/backlog-edit-dialog";
import { StoryForm } from "@/components/planning/story-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteStory } from "../story-actions";
import {
  addStoryToActiveSprint,
  removeStoryFromActiveSprint,
} from "../sprint-membership-actions";
import {
  completeSprint,
  startSprint,
  type SprintLifecycleOperation,
} from "../sprint-lifecycle-actions";
import { emitSprintLifecycleChanged } from "../sprint-lifecycle-events";
import { addStoryToBacklog, removeStoryFromBacklog, deleteBoard } from "./board-actions";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import type { MoveDirection } from "@/components/planning/backlog-section-header";

import type {
  DeleteBoardDialogState,
  PageState,
  ScopedFetchResult,
  SprintCompleteConfirmDialogState,
  SprintCompleteDialogState,
  SprintStartDialogState,
} from "./backlog-types";
import { isCompleteSprintTarget } from "./backlog-view-model";
import { BacklogSection } from "./backlog-section";
import { fetchBacklogData, patchStoryStatus, patchStoryAssignee, swapBoardOrder } from "./backlog-page-actions";
import {
  SprintStartDialog,
  SprintCompleteConfirmDialog,
  SprintCompleteWithTargetDialog,
  DeleteBoardDialog,
} from "./backlog-dialogs";
import { CreateBoardDialog } from "./backlog-create-board-dialog";

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
  const [completeConfirmDialog, setCompleteConfirmDialog] =
    useState<SprintCompleteConfirmDialogState | null>(null);
  const [completeDialog, setCompleteDialog] = useState<SprintCompleteDialogState | null>(null);
  const [completeTargetBacklogId, setCompleteTargetBacklogId] = useState<string>("");
  const [completeDialogError, setCompleteDialogError] = useState<string | null>(null);
  const [deleteBoardDialog, setDeleteBoardDialog] = useState<DeleteBoardDialogState | null>(null);
  const [editBoardBacklog, setEditBoardBacklog] = useState<BacklogEditItem | null>(null);

  const showErrorToast = useCallback((message: string) => {
    setErrorToast(message);
  }, []);

  useEffect(() => {
    if (!errorToast) return;
    const timeoutId = window.setTimeout(() => setErrorToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [errorToast]);

  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;

  const fetchResult =
    singleProjectId && fetchResultState?.projectId === singleProjectId
      ? fetchResultState.result
      : null;

  const state: PageState = useMemo(
    () => (!singleProjectId ? { kind: "no-project" } : fetchResult === null ? { kind: "loading" } : fetchResult),
    [fetchResult, singleProjectId],
  );

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
      if (value.trim().length === 0) params.delete(paramKey);
      else params.set(paramKey, value);
      const qs = params.toString();
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of Object.values(PLANNING_FILTER_KEYS)) params.delete(key);
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  // ── Derived state ──────────────────────────────────────────────────

  const filteredSections =
    state.kind === "ok"
      ? state.sections.map((section) => ({
          ...section,
          stories: applyPlanningStoryFilters(section.stories, filters),
        }))
      : [];
  const allStories = state.kind === "ok" ? state.sections.flatMap((s) => s.stories) : [];
  const statusOptions = buildStoryStatusOptions(allStories);
  const typeOptions = buildStoryTypeOptions(allStories);
  const labelOptions = buildStoryLabelOptions(allStories);
  const epicOptions = buildStoryEpicOptions(allStories);
  const assigneeOptions = [
    { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
    ...(state.kind === "ok" ? state.assignees : []),
  ];
  const assignableAgents = state.kind === "ok" ? state.assignableAgents : [];

  const totalWorkItems = state.kind === "ok"
    ? state.sections.reduce((acc, s) => acc + s.stories.length + s.stories.reduce((t, st) => t + st.task_count, 0), 0)
    : 0;
  const visibleWorkItems = state.kind === "ok"
    ? filteredSections.reduce((acc, s) => acc + s.stories.length + s.stories.reduce((t, st) => t + st.task_count, 0), 0)
    : 0;
  const hasAnyActiveSprint =
    state.kind === "ok" && state.sections.some((s) => s.backlog.kind === "SPRINT" && s.backlog.status === "ACTIVE");
  const defaultBacklogId =
    state.kind === "ok" ? state.sections.find((s) => s.backlog.is_default)?.backlog.id ?? null : null;
  const completeDialogTargetOptions = useMemo(
    () =>
      state.kind === "ok" && completeDialog
        ? state.sections.map((s) => s.backlog).filter((b) => isCompleteSprintTarget(b, completeDialog.backlogId))
        : [],
    [completeDialog, state],
  );
  const activeSelectedStoryId =
    state.kind === "ok" && selectedStoryId && state.sections.some((s) => s.stories.some((st) => st.id === selectedStoryId))
      ? selectedStoryId
      : null;
  const selectedStoryLabels =
    state.kind === "ok" && activeSelectedStoryId
      ? state.sections.flatMap((s) => s.stories).find((st) => st.id === activeSelectedStoryId)?.labels
      : undefined;

  // ── Data fetching ──────────────────────────────────────────────────

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) throw new Error("Select a single project before refreshing.");
    const result = await fetchBacklogData(singleProjectId);
    setFetchResultState({ projectId: singleProjectId, result });
  }, [singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    let cancelled = false;
    void fetchBacklogData(singleProjectId)
      .then((result) => { if (!cancelled) setFetchResultState({ projectId: singleProjectId, result }); })
      .catch((error) => { if (!cancelled) setFetchResultState({ projectId: singleProjectId, result: { kind: "error", message: String(error) } }); });
    return () => { cancelled = true; };
  }, [singleProjectId]);

  // ── Callbacks ──────────────────────────────────────────────────────

  const withPendingStory = useCallback(
    async (storyId: string, ids: Record<string, true>, setIds: React.Dispatch<React.SetStateAction<Record<string, true>>>, fn: () => Promise<void>) => {
      if (ids[storyId]) return;
      setIds((prev) => ({ ...prev, [storyId]: true }));
      try { await fn(); } catch (error) { showErrorToast(error instanceof Error ? error.message : "Operation failed."); }
      finally { setIds((prev) => { const next = { ...prev }; delete next[storyId]; return next; }); }
    },
    [showErrorToast],
  );

  const handleStoryDelete = useCallback(
    (storyId: string) =>
      void withPendingStory(storyId, pendingDeleteStoryIds, setPendingDeleteStoryIds, async () => {
        await deleteStory(storyId);
        if (selectedStoryId === storyId) setSelectedStoryId(null);
        await refreshCurrentView();
      }),
    [pendingDeleteStoryIds, refreshCurrentView, selectedStoryId, withPendingStory],
  );

  const handleStoryStatusChange = useCallback(
    (storyId: string, status: ItemStatus) =>
      void withPendingStory(storyId, { ...pendingStoryIds, ...pendingDeleteStoryIds }, setPendingStoryIds, async () => {
        await patchStoryStatus(storyId, status);
        await refreshCurrentView();
      }),
    [pendingDeleteStoryIds, pendingStoryIds, refreshCurrentView, withPendingStory],
  );

  const handleStoryAssigneeChange = useCallback(
    (storyId: string, nextAssigneeAgentId: string | null) =>
      void withPendingStory(storyId, { ...pendingStoryIds, ...pendingDeleteStoryIds }, setPendingStoryIds, async () => {
        await patchStoryAssignee(storyId, nextAssigneeAgentId);
        await refreshCurrentView();
      }),
    [pendingDeleteStoryIds, pendingStoryIds, refreshCurrentView, withPendingStory],
  );

  const updateSprintMembership = useCallback(
    async (storyId: string, operation: "add" | "remove") => {
      if (!singleProjectId) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        if (operation === "add") await addStoryToActiveSprint(singleProjectId, storyId);
        else await removeStoryFromActiveSprint(singleProjectId, storyId);
        await refreshCurrentView();
      } catch (error) {
        showErrorToast(error instanceof Error ? error.message : "Failed to update sprint membership.");
      } finally {
        setPendingStoryIds((prev) => { const next = { ...prev }; delete next[storyId]; return next; });
      }
    },
    [refreshCurrentView, showErrorToast, singleProjectId],
  );

  const updateSprintLifecycle = useCallback(
    async (backlogId: string, operation: SprintLifecycleOperation) => {
      if (!singleProjectId) return;
      setPendingSprintIds((prev) => ({ ...prev, [backlogId]: true }));
      try {
        if (operation === "start") await startSprint(singleProjectId, backlogId);
        else await completeSprint(singleProjectId, backlogId);
        emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId, operation });
        await refreshCurrentView();
      } catch (error) {
        showErrorToast(error instanceof Error ? error.message : "Failed to update sprint status.");
      } finally {
        setPendingSprintIds((prev) => { const next = { ...prev }; delete next[backlogId]; return next; });
      }
    },
    [refreshCurrentView, showErrorToast, singleProjectId],
  );

  const handleCompleteSprint = useCallback(
    (backlogId: string, backlogName: string) => {
      if (state.kind !== "ok") { showErrorToast("Sprint data is not available. Refresh and try again."); return; }
      const section = state.sections.find((s) => s.backlog.id === backlogId);
      if (!section) { showErrorToast("Sprint was not found in current view. Refresh and try again."); return; }
      const openStories = section.stories.filter((s) => s.status !== "DONE");
      if (openStories.length > 0) {
        const targets = state.sections.map((s) => s.backlog).filter((b) => isCompleteSprintTarget(b, backlogId));
        if (targets.length === 0) { showErrorToast("No target sprint/backlog is available for open work items. Create one first."); return; }
        const defaultId = targets.find((b) => b.is_default)?.id ?? targets[0].id;
        setCompleteDialog({ backlogId, backlogName, completedCount: section.stories.filter((s) => s.status === "DONE").length, openStories });
        setCompleteTargetBacklogId(defaultId);
        setCompleteDialogError(null);
        return;
      }
      setCompleteConfirmDialog({ backlogId, backlogName });
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
      for (const story of completeDialog.openStories) {
        if (completeTargetBacklogId === defaultBacklogId) { await removeStoryFromActiveSprint(singleProjectId, story.id); continue; }
        await removeStoryFromBacklog(completeDialog.backlogId, story.id);
        try { await addStoryToBacklog(completeTargetBacklogId, story.id); }
        catch (error) { try { await addStoryToBacklog(completeDialog.backlogId, story.id); } catch { /* rollback failure; original error is more actionable */ } throw error; }
      }
      await completeSprint(singleProjectId, completeDialog.backlogId);
      emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId: completeDialog.backlogId, operation: "complete" });
      setCompleteDialog(null); setCompleteTargetBacklogId(""); await refreshCurrentView();
    } catch (error) { setCompleteDialogError(error instanceof Error ? error.message : "Failed to complete sprint."); }
    finally { setPendingSprintIds((prev) => { const next = { ...prev }; delete next[completeDialog.backlogId]; return next; }); }
  }, [completeDialog, completeDialogTargetOptions, completeTargetBacklogId, defaultBacklogId, refreshCurrentView, singleProjectId]);

  const handleEditBoard = useCallback(
    (backlogId: string) => {
      if (state.kind !== "ok") return;
      const section = state.sections.find((s) => s.backlog.id === backlogId);
      if (!section) return;
      const { backlog } = section;
      setEditBoardBacklog({
        id: backlog.id, name: backlog.name, kind: backlog.kind, status: backlog.status,
        goal: backlog.goal, start_date: backlog.start_date, end_date: backlog.end_date, is_default: backlog.is_default,
      });
    },
    [state],
  );

  const handleMoveBoard = useCallback(
    async (backlogId: string, direction: MoveDirection) => {
      if (state.kind !== "ok") return;
      const moveable = state.sections.map((s) => s.backlog).filter((b) => !(b.kind === "SPRINT" && b.status === "ACTIVE") && !b.is_default);
      const currentIndex = moveable.findIndex((b) => b.id === backlogId);
      if (currentIndex === -1) return;
      let swapIndex: number;
      if (direction === "top") swapIndex = 0;
      else if (direction === "up") swapIndex = currentIndex - 1;
      else if (direction === "down") swapIndex = currentIndex + 1;
      else swapIndex = moveable.length - 1;
      if (swapIndex === currentIndex || swapIndex < 0 || swapIndex >= moveable.length) return;
      const current = moveable[currentIndex];
      const swapWith = moveable[swapIndex];
      setPendingBoardIds((prev) => ({ ...prev, [backlogId]: true }));
      try {
        await swapBoardOrder(current.id, swapWith.id, current.display_order ?? (currentIndex + 1) * 100, swapWith.display_order ?? (swapIndex + 1) * 100);
        await refreshCurrentView();
      } catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to reorder board."); }
      finally { setPendingBoardIds((prev) => { const next = { ...prev }; delete next[backlogId]; return next; }); }
    },
    [refreshCurrentView, showErrorToast, state],
  );

  const handleDeleteBoardConfirm = useCallback(async () => {
    if (!deleteBoardDialog) return;
    setPendingBoardIds((prev) => ({ ...prev, [deleteBoardDialog.backlogId]: true }));
    try { await deleteBoard(deleteBoardDialog.backlogId); setDeleteBoardDialog(null); await refreshCurrentView(); }
    catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to delete board."); }
    finally { setPendingBoardIds((prev) => { const next = { ...prev }; delete next[deleteBoardDialog.backlogId]; return next; }); }
  }, [deleteBoardDialog, refreshCurrentView, showErrorToast]);

  // ── Render ─────────────────────────────────────────────────────────

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
            <PlanningFilters value={filters} onChange={updateFilterParam} onClear={clearAllFilters} disabled={state.kind !== "ok"} statusOptions={statusOptions} typeOptions={typeOptions} labelOptions={labelOptions} epicOptions={epicOptions} assigneeOptions={assigneeOptions} className="flex-1" />
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
              hasAnyActiveSprint={hasAnyActiveSprint}
              siblingBacklogs={state.sections.map((s) => s.backlog)}
              assigneeOptions={assignableAgents}
              onStoryClick={(storyId) => setSelectedStoryId(storyId)}
              onStoryAssigneeChange={handleStoryAssigneeChange}
              onAddToActiveSprint={(storyId) => void updateSprintMembership(storyId, "add")}
              onRemoveFromActiveSprint={(storyId) => void updateSprintMembership(storyId, "remove")}
              onStartSprint={(backlogId, backlogName) => setStartDialog({ backlogId, backlogName })}
              onCompleteSprint={handleCompleteSprint}
              onCreateStory={(backlogId) => setCreateBacklogId(backlogId)}
              onStoryDelete={handleStoryDelete}
              onStoryStatusChange={handleStoryStatusChange}
              onEditBoard={handleEditBoard}
              onDeleteBoard={(backlogId, backlogName, isDefault) => {
                if (isDefault) { showErrorToast("Default board cannot be deleted."); return; }
                setDeleteBoardDialog({ backlogId, backlogName });
              }}
              onMoveBoard={handleMoveBoard}
              pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
              pendingDeleteStoryIds={new Set(Object.keys(pendingDeleteStoryIds))}
              pendingSprintIds={new Set(Object.keys(pendingSprintIds))}
              pendingBoardIds={new Set(Object.keys(pendingBoardIds))}
            />
          ))}
          <div className="mt-1 rounded-md border border-border/40 bg-card/20 px-3 py-2 text-xs text-muted-foreground">
            {visibleWorkItems} of {totalWorkItems} work items visible | Estimate: - of -
          </div>
        </div>
      )}

      {/* Sprint dialogs */}
      <SprintStartDialog
        backlogName={startDialog?.backlogName ?? ""}
        open={startDialog !== null}
        submitting={startDialog !== null && Boolean(pendingSprintIds[startDialog.backlogId])}
        onOpenChange={(open) => { if (!open) setStartDialog(null); }}
        onConfirm={() => { if (startDialog) { void updateSprintLifecycle(startDialog.backlogId, "start"); setStartDialog(null); } }}
      />
      <SprintCompleteConfirmDialog
        backlogName={completeConfirmDialog?.backlogName ?? ""}
        open={completeConfirmDialog !== null}
        submitting={completeConfirmDialog !== null && Boolean(pendingSprintIds[completeConfirmDialog.backlogId])}
        onOpenChange={(open) => { if (!open) setCompleteConfirmDialog(null); }}
        onConfirm={() => { if (completeConfirmDialog) { void updateSprintLifecycle(completeConfirmDialog.backlogId, "complete"); setCompleteConfirmDialog(null); } }}
      />
      {completeDialog && (
        <SprintCompleteWithTargetDialog
          dialog={completeDialog}
          open
          submitting={Boolean(pendingSprintIds[completeDialog.backlogId])}
          targetBacklogId={completeTargetBacklogId}
          targetOptions={completeDialogTargetOptions}
          error={completeDialogError}
          onTargetChange={setCompleteTargetBacklogId}
          onOpenChange={(open) => { if (!open) { setCompleteDialog(null); setCompleteTargetBacklogId(""); setCompleteDialogError(null); } }}
          onConfirm={() => void handleCompleteDialogConfirm()}
          onClearError={() => setCompleteDialogError(null)}
        />
      )}
      <DeleteBoardDialog
        backlogName={deleteBoardDialog?.backlogName ?? ""}
        open={deleteBoardDialog !== null}
        submitting={deleteBoardDialog !== null && Boolean(pendingBoardIds[deleteBoardDialog.backlogId])}
        onOpenChange={(open) => { if (!open) setDeleteBoardDialog(null); }}
        onConfirm={() => void handleDeleteBoardConfirm()}
      />
      <CreateBoardDialog
        open={createBoardOpen}
        projectId={singleProjectId}
        onOpenChange={setCreateBoardOpen}
        onCreated={() => void refreshCurrentView().catch((e) => showErrorToast(e instanceof Error ? e.message : "Failed to refresh backlog data."))}
      />

      {/* Story detail + story form dialogs */}
      <StoryDetailDialog
        storyId={activeSelectedStoryId}
        open={activeSelectedStoryId !== null}
        onOpenChange={(open) => { if (!open) setSelectedStoryId(null); }}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={() => void refreshCurrentView().catch((e) => showErrorToast(e instanceof Error ? e.message : "Failed to refresh backlog data."))}
      />
      <BacklogEditDialog
        backlog={editBoardBacklog}
        open={editBoardBacklog !== null}
        onOpenChange={(open) => { if (!open) setEditBoardBacklog(null); }}
        onSaved={() => { setEditBoardBacklog(null); void refreshCurrentView().catch((e) => showErrorToast(e instanceof Error ? e.message : "Failed to refresh backlog data.")); }}
      />
      <Dialog open={createBacklogId !== null} onOpenChange={(open) => { if (!open) setCreateBacklogId(null); }}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Create story</DialogTitle></DialogHeader>
          {singleProjectId && createBacklogId && (
            <StoryForm mode="create" projectId={singleProjectId} backlogId={createBacklogId} onSaved={() => { setCreateBacklogId(null); void refreshCurrentView().catch((e) => showErrorToast(e instanceof Error ? e.message : "Failed to refresh.")); }} onCancel={() => setCreateBacklogId(null)} />
          )}
        </DialogContent>
      </Dialog>
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
