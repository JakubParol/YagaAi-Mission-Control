"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Radar, ShieldAlert, TimerReset, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RefreshControl } from "@/components/refresh-control";
import { PlanningPageShell } from "@/components/planning/planning-page-shell";
import { ThemedSelect } from "@/components/ui/themed-select";
import { PlanningControlBar } from "@/components/planning/planning-control-bar";
import { PlanningCreateButton } from "@/components/planning/planning-create-button";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EpicDeleteConfirmDialog } from "@/components/planning/epic-delete-confirm-dialog";
import { EpicFormDialog, type EpicFormValues } from "@/components/planning/epic-form-dialog";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import {
  type DeleteConfirmPhase,
} from "@/components/planning/story-actions-menu-types";

import { EpicRow, type PreviewState } from "./epic-row";
import { deleteEpic, fetchEpicDetail, fetchOverview, fetchStoriesPreview, parseBlocked, parseEpicStatus, parseSort } from "./epics-page-actions";
import {
  EPIC_OVERVIEW_DEFAULT_FILTERS,
  EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS,
  EPIC_OVERVIEW_SORT_OPTIONS,
  type EpicOverviewAgent,
  type EpicOverviewFilters,
  type EpicOverviewItem,
  type EpicOverviewLabel,
} from "./overview-types";
import { applyClientEpicOverviewFilters, buildEpicOverviewStats, toPercentLabel } from "./overview-view-model";
import { useStoryActions } from "./use-story-actions";

const FILTER_KEYS = {
  search: "q", status: "status", ownerId: "owner", label: "label", blocked: "blocked", sort: "sort",
} as const;

const STATUS_OPTIONS = [
  { value: "", label: "Status: All" },
  { value: "TODO", label: "TODO" },
  { value: "IN_PROGRESS", label: "IN PROGRESS" },
  { value: "DONE", label: "DONE" },
];

const BLOCKED_OPTIONS = [
  { value: "", label: "Blocked: All" },
  { value: "true", label: "Blocked only" },
  { value: "false", label: "Unblocked only" },
];

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; rows: EpicOverviewItem[]; agents: EpicOverviewAgent[]; labels: EpicOverviewLabel[] };

interface DeleteDialogState {
  epicId: string;
  epicTitle: string;
  phase: DeleteConfirmPhase;
}

interface EditDialogState {
  open: boolean;
  epicId: string;
  initialValues?: Partial<EpicFormValues>;
}

function EpicOverviewPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: "no-project" });
  const [previewByKey, setPreviewByKey] = useState<Record<string, PreviewState>>({});
  const previewByKeyRef = useRef<Record<string, PreviewState>>({});
  const previewFetchInFlightRef = useRef<Set<string>>(new Set());
  const activeProjectIdRef = useRef<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDialogState, setEditDialogState] = useState<EditDialogState | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<DeleteDialogState | null>(null);
  const [epicActionError, setEpicActionError] = useState<string | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const singleProjectId = !allSelected && selectedProjectIds.length === 1
    ? selectedProjectIds[0] : null;

  const sa = useStoryActions(singleProjectId, setPreviewByKey);
  const { resetAll } = sa;

  useEffect(() => {
    activeProjectIdRef.current = singleProjectId;
    previewFetchInFlightRef.current.clear();
    previewByKeyRef.current = {};
    setPreviewByKey({});
    resetAll();
    setCreateOpen(false);
    setEditDialogState(null);
    setDeleteDialogState(null);
    setEpicActionError(null);
    setState(singleProjectId ? { kind: "loading" } : { kind: "no-project" });
  }, [singleProjectId, resetAll]);

  const filters = useMemo<EpicOverviewFilters>(() => ({
    search: searchParams.get(FILTER_KEYS.search) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.search,
    status: parseEpicStatus(searchParams.get(FILTER_KEYS.status)),
    ownerId: searchParams.get(FILTER_KEYS.ownerId) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.ownerId,
    label: searchParams.get(FILTER_KEYS.label) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.label,
    blocked: parseBlocked(searchParams.get(FILTER_KEYS.blocked)),
    sort: parseSort(searchParams.get(FILTER_KEYS.sort)),
  }), [searchParams]);

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim().length === 0) { params.delete(key); } else { params.set(key, value); }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of Object.values(FILTER_KEYS)) params.delete(k);
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const agentLabelById = useMemo(() => {
    if (state.kind !== "ok") return new Map<string, string>();
    return new Map(state.agents.map((a) => [a.id, a.label]));
  }, [state]);

  const doFetchOverview = useCallback(
    (projectId: string) => fetchOverview(projectId, filters),
    [filters],
  );
  const doFetchStoriesPreview = useCallback(
    (epicId: string) => fetchStoriesPreview(epicId, singleProjectId, agentLabelById),
    [agentLabelById, singleProjectId],
  );

  const ensurePreviewLoaded = useCallback(async (epicKey: string) => {
    const reqProjectId = activeProjectIdRef.current;
    const scopeKey = `${reqProjectId ?? "none"}:${epicKey}`;
    if (previewByKeyRef.current[epicKey]?.kind === "ready") return;
    if (previewFetchInFlightRef.current.has(scopeKey)) return;

    const rows = state.kind === "ok" ? state.rows : [];
    const epic = rows.find((r) => r.work_item_key === epicKey);
    if (!epic?.work_item_id) return;

    previewFetchInFlightRef.current.add(scopeKey);
    setPreviewByKey((c) => ({ ...c, [epicKey]: { kind: "loading" } }));
    try {
      const stories = await doFetchStoriesPreview(epic.work_item_id);
      if (activeProjectIdRef.current !== reqProjectId) return;
      setPreviewByKey((c) => ({ ...c, [epicKey]: { kind: "ready", stories } }));
    } catch (error) {
      if (activeProjectIdRef.current !== reqProjectId) return;
      setPreviewByKey((c) => ({
        ...c,
        [epicKey]: { kind: "error", message: error instanceof Error ? error.message : "Failed to load story preview." },
      }));
    } finally {
      previewFetchInFlightRef.current.delete(scopeKey);
    }
  }, [doFetchStoriesPreview, state]);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) throw new Error("Select a single project before refreshing.");
    const result = await doFetchOverview(singleProjectId);
    setState({ kind: "ok", ...result });
  }, [doFetchOverview, singleProjectId]);

  const handleEditEpic = useCallback(async (epicId: string) => {
    setEpicActionError(null);
    try {
      const detail = await fetchEpicDetail(epicId);
      setEditDialogState({
        open: true,
        epicId,
        initialValues: {
          title: detail.title,
          status: detail.status,
          description: detail.description ?? "",
          priority: detail.priority !== null ? String(detail.priority) : "",
        },
      });
    } catch (err) {
      setEpicActionError(err instanceof Error ? err.message : "Failed to load epic details for editing.");
    }
  }, []);

  const handleDeleteEpic = useCallback((epicId: string) => {
    if (state.kind !== "ok") return;
    const item = state.rows.find((r) => r.work_item_id === epicId);
    if (!item) return;
    if (item.children_total > 0) {
      setEpicActionError(
        `Cannot delete "${item.title}" — it still has ${item.children_total} child ${item.children_total === 1 ? "story" : "stories"}. Move or delete them first.`,
      );
      return;
    }
    setDeleteDialogState({ epicId, epicTitle: item.title, phase: "open" });
  }, [state]);

  const handleCreateSaved = useCallback(async (_epicId: string) => {
    setEpicActionError(null);
    try { await refreshCurrentView(); } catch (err) {
      setEpicActionError(err instanceof Error ? err.message : "Failed to refresh after creating epic.");
    }
  }, [refreshCurrentView]);

  const handleEditSaved = useCallback(async () => {
    setEpicActionError(null);
    try { await refreshCurrentView(); } catch (err) {
      setEpicActionError(err instanceof Error ? err.message : "Failed to refresh after updating epic.");
    }
  }, [refreshCurrentView]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteDialogState) return;
    const { epicId } = deleteDialogState;
    setDeleteDialogState((s) => s ? { ...s, phase: "submitting" } : null);
    setEpicActionError(null);
    try {
      await deleteEpic(epicId);
      setDeleteDialogState(null);
      await refreshCurrentView();
    } catch (err) {
      setDeleteDialogState((s) => s ? { ...s, phase: "open" } : null);
      setEpicActionError(err instanceof Error ? err.message : "Failed to delete epic.");
    }
  }, [deleteDialogState, refreshCurrentView]);

  useEffect(() => {
    if (!singleProjectId) return;
    let cancelled = false;
    void doFetchOverview(singleProjectId)
      .then((result) => { if (!cancelled) setState({ kind: "ok", ...result }); })
      .catch((error) => {
        if (cancelled) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "Failed to load epic overview." });
      });
    return () => { cancelled = true; };
  }, [doFetchOverview, singleProjectId]);

  const rows = useMemo(
    () => (state.kind === "ok" ? applyClientEpicOverviewFilters(state.rows, filters, "all") : []),
    [filters, state],
  );
  const stats = useMemo(() => buildEpicOverviewStats(rows), [rows]);
  const ownerOptions = useMemo(() => [
    { value: "", label: "Owner: All" },
    ...(state.kind === "ok" ? state.agents.map((a) => ({ value: a.id, label: a.label })) : []),
  ], [state]);
  const labelOptions = useMemo(() => [
    { value: "", label: "Label: All" },
    ...(state.kind === "ok" ? state.labels.map((l) => ({ value: l.name, label: l.name })) : []),
  ], [state]);

  const hasActiveFilters = filters.search.trim().length > 0
    || filters.status.length > 0 || filters.ownerId.length > 0
    || filters.label.trim().length > 0 || filters.blocked.length > 0
    || filters.sort !== EPIC_OVERVIEW_DEFAULT_FILTERS.sort;

  const pageState = !singleProjectId
    ? { kind: "no-project" as const }
    : state.kind === "no-project" ? { kind: "loading" as const } : state;

  useEffect(() => { previewByKeyRef.current = previewByKey; }, [previewByKey]);

  useEffect(() => {
    const keys = Object.entries(sa.expandedByKey).filter(([, v]) => v).map(([k]) => k);
    for (const k of keys) void ensurePreviewLoaded(k);
  }, [ensurePreviewLoaded, sa.expandedByKey]);

  const createDialogNode = singleProjectId ? (
    <EpicFormDialog
      mode="create"
      projectId={singleProjectId}
      open={createOpen}
      onOpenChange={setCreateOpen}
      onSaved={handleCreateSaved}
    />
  ) : null;

  const editDialogNode = editDialogState ? (
    <EpicFormDialog
      mode="edit"
      epicId={editDialogState.epicId}
      initialValues={editDialogState.initialValues}
      open={editDialogState.open}
      onOpenChange={(open) => setEditDialogState((s) => s ? { ...s, open } : null)}
      onSaved={handleEditSaved}
    />
  ) : null;

  const deleteDialogNode = deleteDialogState ? (
    <EpicDeleteConfirmDialog
      epicTitle={deleteDialogState.epicTitle}
      confirmPhase={deleteDialogState.phase}
      onPhaseChange={(next) => setDeleteDialogState((s) => s ? { ...s, phase: next } : null)}
      onConfirmDelete={handleConfirmDelete}
    />
  ) : null;

  return (
    <>
      {createDialogNode}
      {editDialogNode}
      {deleteDialogNode}
      <PlanningPageShell
        icon={Radar}
        title="Epics Overview"
        subtitle="Health, progress, and risk overview for all epics in selected project."
        controls={singleProjectId ? (
          <PlanningControlBar
            search={filters.search}
            onSearchChange={(v) => updateParam(FILTER_KEYS.search, v)}
            onClear={clearAllFilters}
            clearDisabled={!hasActiveFilters}
            disabled={pageState.kind !== "ok"}
            createAction={
              <PlanningCreateButton tooltip="Create epic" onClick={() => { setEpicActionError(null); setCreateOpen(true); }} />
            }
          >
            <ThemedSelect value={filters.status} options={STATUS_OPTIONS} placeholder="Status" onValueChange={(v) => updateParam(FILTER_KEYS.status, v)} triggerClassName="h-8 min-w-[130px] bg-background/70 text-xs" contentClassName="w-[180px]" />
            <ThemedSelect value={filters.ownerId} options={ownerOptions} placeholder="Owner" onValueChange={(v) => updateParam(FILTER_KEYS.ownerId, v)} triggerClassName="h-8 min-w-[150px] bg-background/70 text-xs" contentClassName="w-[220px]" />
            <ThemedSelect value={filters.label} options={labelOptions} placeholder="Label" onValueChange={(v) => updateParam(FILTER_KEYS.label, v)} triggerClassName="h-8 min-w-[140px] bg-background/70 text-xs" contentClassName="w-[200px]" />
            <ThemedSelect value={filters.blocked} options={BLOCKED_OPTIONS} placeholder="Blocked" onValueChange={(v) => updateParam(FILTER_KEYS.blocked, v)} triggerClassName="h-8 min-w-[140px] bg-background/70 text-xs" contentClassName="w-[200px]" />
            <ThemedSelect value={filters.sort} options={EPIC_OVERVIEW_SORT_OPTIONS} placeholder="Sort" onValueChange={(v) => updateParam(FILTER_KEYS.sort, v)} triggerClassName="h-8 min-w-[165px] bg-background/70 text-xs" contentClassName="w-[210px]" />
          </PlanningControlBar>
        ) : null}
        actions={<RefreshControl onRefresh={refreshCurrentView} disabled={!singleProjectId} className="items-stretch sm:items-end" />}
      />

      {pageState.kind === "no-project" && (
        <EmptyState icon="default" title="Select a project" description="Choose a single project from the selector above to view epic health overview." />
      )}
      {pageState.kind === "loading" && (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      )}
      {pageState.kind === "error" && (
        <EmptyState icon="default" title="Failed to load epic overview" description={pageState.message} />
      )}

      {pageState.kind === "ok" && epicActionError && (
        <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {epicActionError}
        </p>
      )}

      {pageState.kind === "ok" && (
        <>
          <section className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={Radar} label="Epics" value={String(stats.epicCount)} />
            <StatCard icon={TrendingUp} label="Avg progress (all)" value={toPercentLabel(stats.averageProgressPct)} />
            <StatCard icon={TrendingUp} label="Avg trend (7d)" value={`+${toPercentLabel(stats.averageTrend7dPct)}`} />
            <StatCard icon={ShieldAlert} label="Blocked stories" value={String(stats.blockedStories)} />
            <StatCard icon={TimerReset} label="Last update age" value={`${stats.maxStaleDays}d`} />
          </section>

          {rows.length === 0 ? (
            <EmptyState icon="default" title="No matching epics" description="No epic matches active filters. Adjust filters to broaden scope." />
          ) : (
            <section className="overflow-hidden rounded-lg border border-border/60 bg-card/20">
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[40px_120px_minmax(0,1fr)_90px_160px_130px_90px_64px] gap-2 border-b border-border/30 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span aria-hidden="true" /><span>Epic</span><span>Title</span><span>Status</span><span>Progress</span><span>Stories</span><span>Risk</span><span aria-hidden="true" />
                  </div>
                  <div className="divide-y divide-border/20">
                    {rows.map((item) => (
                      <EpicRow
                        key={item.work_item_key}
                        item={item}
                        isExpanded={sa.expandedByKey[item.work_item_key] ?? false}
                        previewState={previewByKey[item.work_item_key] ?? { kind: "idle" as const }}
                        previewFilters={sa.previewFiltersByKey[item.work_item_key] ?? EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS}
                        storyPendingById={sa.storyPendingById}
                        actionError={sa.storyErrorByKey[item.work_item_key]}
                        onToggleExpand={sa.handleToggleExpand}
                        onPreviewFilterChange={sa.handlePreviewFilterChange}
                        onStoryClick={setSelectedStoryId}
                        onChangeStoryStatus={sa.handleChangeStoryStatus}
                        onAddStoryToSprint={sa.handleAddStoryToSprint}
                        onEdit={handleEditEpic}
                        onDelete={handleDeleteEpic}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={(open) => { if (!open) setSelectedStoryId(null); }}
        onStoryUpdated={() => { void refreshCurrentView().catch(() => undefined); }}
      />
    </>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function PlanningEpicsOverviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <EpicOverviewPageContent />
    </Suspense>
  );
}
