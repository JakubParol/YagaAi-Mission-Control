"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers, Loader2 } from "lucide-react";

import type { WorkItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import { PlanningControlBar } from "@/components/planning/planning-control-bar";
import { PlanningCreateButton } from "@/components/planning/planning-create-button";
import { hasActivePlanningFilters, PlanningFilters, type PlanningFiltersValue } from "@/components/planning/planning-filters";
import { PlanningPageShell } from "@/components/planning/planning-page-shell";
import { RefreshControl } from "@/components/refresh-control";
import type { BacklogEditItem } from "@/components/planning/backlog-edit-dialog";
import { MoveToEpicDialog, type MoveToEpicTarget } from "@/components/planning/move-to-epic-dialog";
import { fetchEpics } from "@/components/planning/story-detail-actions";
import { apiUrl } from "@/lib/api-client";
import { deleteStory } from "../story-actions";

import type {
  DeleteBoardDialogState, PageState, ScopedFetchResult,
  SprintCompleteConfirmDialogState, SprintCompleteDialogState, SprintStartDialogState,
} from "./backlog-types";
import { BacklogSection } from "./backlog-section";
import { fetchBacklogData, patchStoryStatus, patchStoryAssignee } from "./backlog-page-actions";
import { BacklogPageDialogs } from "./backlog-page-dialogs";
import {
  readFiltersFromSearchParams, buildFilterUrl, buildClearFiltersUrl,
  computeFilteredSections, buildBacklogFilterOptions, getAssignableAgents,
  computeWorkItemStats, hasAnyActiveSprint, findDefaultBacklogId,
  computeCompleteDialogTargets, resolveActiveSelectedStoryId, resolveSelectedStoryLabels,
  removePendingId, buildEditBoardItem, buildStoryBacklogMembership,
} from "./backlog-page-derived";
import { useBacklogPageCallbacks } from "./backlog-page-hooks";

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
  const [epicTargets, setEpicTargets] = useState<MoveToEpicTarget[]>([]);
  const [moveToEpicStoryId, setMoveToEpicStoryId] = useState<string | null>(null);

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
  const completeDialogTargetOptions = useMemo(() => computeCompleteDialogTargets(state, completeDialog?.backlogId ?? null), [completeDialog, state]);
  const activeSelectedStoryId = resolveActiveSelectedStoryId(state, selectedStoryId);
  const selectedStoryLabels = resolveSelectedStoryLabels(state, activeSelectedStoryId);
  const storyMembershipMap = useMemo(() => (state.kind === "ok" ? buildStoryBacklogMembership(state.sections) : new Map<string, Set<string>>()), [state]);

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
    void Promise.all([fetchBacklogData(singleProjectId), fetchEpics(singleProjectId).catch(() => [])])
      .then(([r, epics]) => { if (!cancelled) { setFetchResultState({ projectId: singleProjectId, result: r }); setEpicTargets(epics.map((e) => ({ id: e.id, key: e.key ?? "", title: e.title }))); } })
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
    (storyId: string, status: WorkItemStatus) => void withPendingStory(storyId, { ...pendingStoryIds, ...pendingDeleteStoryIds }, setPendingStoryIds, async () => {
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

  const handleMoveToEpicConfirm = useCallback(async (targetEpicId: string) => {
    if (!moveToEpicStoryId) return;
    const res = await fetch(apiUrl(`/v1/planning/work-items/${moveToEpicStoryId}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_id: targetEpicId }) });
    if (!res.ok) throw new Error(`Failed to move work item. HTTP ${res.status}.`);
    await refreshCurrentView();
  }, [moveToEpicStoryId, refreshCurrentView]);

  const ops = useBacklogPageCallbacks({
    singleProjectId, state, defaultBacklogId, showErrorToast, refreshCurrentView,
    setPendingStoryIds, setPendingSprintIds, setPendingBoardIds,
  });

  const onCompleteSprint = useCallback(
    (backlogId: string, backlogName: string) => {
      const result = ops.handleCompleteSprint(backlogId, backlogName);
      if (result.outcome === "error") { showErrorToast(result.message); return; }
      if (result.outcome === "no-open-stories") { setCompleteConfirmDialog({ backlogId, backlogName }); return; }
      setCompleteDialog(result.dialog);
      setCompleteTargetBacklogId(result.defaultTargetId);
      setCompleteDialogError(null);
    },
    [ops, showErrorToast],
  );

  const onCompleteDialogConfirm = useCallback(
    () => {
      if (!completeDialog) return;
      void ops.handleCompleteDialogConfirm(completeDialog, completeTargetBacklogId, completeDialogTargetOptions, setCompleteDialogError)
        .then((ok) => { if (ok) { setCompleteDialog(null); setCompleteTargetBacklogId(""); } });
    },
    [completeDialog, completeDialogTargetOptions, completeTargetBacklogId, ops],
  );

  const onDeleteBoardConfirm = useCallback(
    () => { if (deleteBoardDialog) void ops.handleDeleteBoardConfirm(deleteBoardDialog.backlogId, () => setDeleteBoardDialog(null)); },
    [deleteBoardDialog, ops],
  );

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      {errorToast && (
        <div role="status" aria-live="polite" className="fixed right-4 top-4 z-50 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 shadow-lg">
          {errorToast}
        </div>
      )}

      <PlanningPageShell
        icon={Layers}
        title="Backlog"
        subtitle="All backlogs and their stories for the selected project."
        controls={singleProjectId ? (
          <PlanningControlBar
            search={filters.search}
            onSearchChange={(v) => updateFilterParam("search", v)}
            onClear={clearAllFilters}
            clearDisabled={!hasActivePlanningFilters(filters)}
            disabled={state.kind !== "ok"}
            createAction={<PlanningCreateButton tooltip="Create board" onClick={() => setCreateBoardOpen(true)} />}
          >
            <PlanningFilters value={filters} onChange={updateFilterParam} disabled={state.kind !== "ok"} statusOptions={filterOptions.statusOptions} typeOptions={filterOptions.typeOptions} labelOptions={filterOptions.labelOptions} epicOptions={filterOptions.epicOptions} assigneeOptions={filterOptions.assigneeOptions} />
          </PlanningControlBar>
        ) : null}
        actions={<RefreshControl onRefresh={refreshCurrentView} disabled={!singleProjectId} className="items-stretch sm:items-end" />}
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
              allSections={state.sections}
              storyMembershipMap={storyMembershipMap}
              onStoryClick={setSelectedStoryId}
              onStoryAssigneeChange={handleStoryAssigneeChange}
              onMoveToBacklog={(storyId, sourceId, targetId) => void ops.moveToBacklog(storyId, sourceId, targetId)}
              onLinkParent={epicTargets.length > 0 ? setMoveToEpicStoryId : undefined}
              onStartSprint={(id, name) => setStartDialog({ backlogId: id, backlogName: name })}
              onCompleteSprint={onCompleteSprint}
              onCreateStory={setCreateBacklogId}
              onStoryDelete={handleStoryDelete}
              onStoryStatusChange={handleStoryStatusChange}
              onEditBoard={(id) => { const item = buildEditBoardItem(state, id); if (item) setEditBoardBacklog(item); }}
              onDeleteBoard={(id, name, isDefault) => { if (isDefault) { showErrorToast("Default board cannot be deleted."); return; } setDeleteBoardDialog({ backlogId: id, backlogName: name }); }}
              onMoveBoard={ops.handleMoveBoard}
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

      <MoveToEpicDialog
        open={moveToEpicStoryId !== null}
        storyKey={null}
        storyTitle=""
        currentEpicId=""
        epicTargets={epicTargets}
        onMove={handleMoveToEpicConfirm}
        onOpenChange={(open) => { if (!open) setMoveToEpicStoryId(null); }}
      />

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
        onStartDialogConfirm={() => { if (startDialog) { void ops.updateSprintLifecycle(startDialog.backlogId, "start"); setStartDialog(null); } }}
        onCompleteConfirmDialogChange={(open) => { if (!open) setCompleteConfirmDialog(null); }}
        onCompleteConfirmDialogConfirm={() => { if (completeConfirmDialog) { void ops.updateSprintLifecycle(completeConfirmDialog.backlogId, "complete"); setCompleteConfirmDialog(null); } }}
        onCompleteDialogChange={(open) => { if (!open) { setCompleteDialog(null); setCompleteTargetBacklogId(""); setCompleteDialogError(null); } }}
        onCompleteDialogConfirm={onCompleteDialogConfirm}
        onCompleteTargetChange={setCompleteTargetBacklogId}
        onClearCompleteError={() => setCompleteDialogError(null)}
        onDeleteBoardDialogChange={(open) => { if (!open) setDeleteBoardDialog(null); }}
        onDeleteBoardConfirm={onDeleteBoardConfirm}
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
