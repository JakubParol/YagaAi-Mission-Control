"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  ListPlus,
  Hash,
  Layers,
  Loader2,
  ListMinus,
  Plus,
  Play,
  Trash2,
  Zap,
} from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { BacklogKind, BacklogStatus, ItemStatus } from "@/lib/planning/types";
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
  type PlanningFilterOption,
  type PlanningFiltersValue,
} from "@/components/planning/planning-filters";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import type { StoryCardStory } from "@/components/planning/story-card";
import { BacklogRow } from "@/components/planning/backlog-row";
import { StoryActionsMenu } from "@/components/planning/story-actions-menu";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { StoryForm } from "@/components/planning/story-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
import { excludeClosedSprintBacklogs } from "./backlog-filters";
import { createBoard, deleteBoard } from "./board-actions";

// ─── Types ───────────────────────────────────────────────────────────

interface BacklogItem {
  id: string;
  name: string;
  kind: BacklogKind;
  status: BacklogStatus;
  is_default: boolean;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface BacklogWithStories {
  backlog: BacklogItem;
  stories: StoryCardStory[];
}

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; sections: BacklogWithStories[]; assignees: PlanningFilterOption[] };

type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; sections: BacklogWithStories[]; assignees: PlanningFilterOption[] };

interface ScopedFetchResult {
  projectId: string;
  result: FetchResult;
}

interface PlanningAgentApiItem {
  id?: string;
  name?: string;
  last_name?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<BacklogKind, { label: string; accent: string }> = {
  SPRINT: { label: "Sprint", accent: "border-l-blue-500" },
  BACKLOG: { label: "Backlog", accent: "border-l-slate-500" },
  IDEAS: { label: "Ideas", accent: "border-l-violet-500" },
};

const BOARD_KIND_OPTIONS: readonly { value: BacklogKind; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "SPRINT", label: "Sprint" },
  { value: "IDEAS", label: "Ideas" },
];

function formatDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return d;
  }
}

function resolveAgentLabel(agent: PlanningAgentApiItem): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

function getSprintStatusCount(stories: StoryCardStory[], status: ItemStatus): number {
  if (status === "IN_PROGRESS") {
    return stories.filter(
      (story) =>
        story.status === "IN_PROGRESS" ||
        story.status === "CODE_REVIEW" ||
        story.status === "VERIFY",
    ).length;
  }
  return stories.filter((story) => story.status === status).length;
}

// ─── Backlog Section ─────────────────────────────────────────────────

function BacklogSection({
  section,
  isActiveSprint,
  hasAnyActiveSprint,
  onStoryClick,
  onAddToActiveSprint,
  onRemoveFromActiveSprint,
  onStartSprint,
  onCompleteSprint,
  onCreateStory,
  onStoryDelete,
  onStoryStatusChange,
  onDeleteBoard,
  pendingStoryIds,
  pendingDeleteStoryIds,
  pendingSprintIds,
  pendingBoardIds,
}: {
  section: BacklogWithStories;
  isActiveSprint: boolean;
  hasAnyActiveSprint: boolean;
  onStoryClick: (storyId: string) => void;
  onAddToActiveSprint: (storyId: string) => void;
  onRemoveFromActiveSprint: (storyId: string) => void;
  onStartSprint: (backlogId: string, backlogName: string) => void;
  onCompleteSprint: (
    backlogId: string,
    backlogName: string,
    unfinishedStoryCount: number,
  ) => void;
  onCreateStory: (backlogId: string) => void;
  onStoryDelete: (storyId: string) => void;
  onStoryStatusChange: (storyId: string, status: ItemStatus) => void;
  onDeleteBoard: (backlogId: string, backlogName: string, isDefault: boolean) => void;
  pendingStoryIds: ReadonlySet<string>;
  pendingDeleteStoryIds: ReadonlySet<string>;
  pendingSprintIds: ReadonlySet<string>;
  pendingBoardIds: ReadonlySet<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { backlog, stories } = section;
  const kindConf = KIND_CONFIG[backlog.kind] ?? KIND_CONFIG.BACKLOG;

  const total = stories.length;
  const start = formatDate(backlog.start_date);
  const end = formatDate(backlog.end_date);
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const isSprint = backlog.kind === "SPRINT";
  const todoCount = isSprint ? getSprintStatusCount(stories, "TODO") : 0;
  const inProgressCount = isSprint ? getSprintStatusCount(stories, "IN_PROGRESS") : 0;
  const doneCount = isSprint ? getSprintStatusCount(stories, "DONE") : 0;
  const canCompleteSprint = isSprint && backlog.status === "ACTIVE";
  const canStartSprint = isSprint && backlog.status !== "ACTIVE";
  const canAddToActiveSprint = backlog.kind === "BACKLOG";
  const canRemoveFromActiveSprint = isActiveSprint;
  const isSprintPending = pendingSprintIds.has(backlog.id);
  const isBoardDeletePending = pendingBoardIds.has(backlog.id);
  const isStartBlockedByActive = canStartSprint && hasAnyActiveSprint;
  const canDeleteBoard = !backlog.is_default;
  const unfinishedStoryCount = isSprint
    ? stories.filter((story) => story.status !== "DONE").length
    : 0;

  return (
    <section
      className={cn(
        "rounded-lg border border-border/60 bg-card/30 overflow-hidden",
        "border-l-2",
        kindConf.accent,
        isActiveSprint && "ring-1 ring-blue-500/20 bg-blue-500/[0.02]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "inline-flex items-center justify-center rounded-sm p-0.5",
            "hover:bg-muted/40 transition-colors duration-150",
            "focus-ring",
          )}
          aria-label={collapsed ? "Expand backlog section" : "Collapse backlog section"}
        >
          <Chevron className="size-4 shrink-0 text-muted-foreground" />
        </button>

        <h3 className="text-sm font-semibold text-foreground">
          {backlog.name}
        </h3>

        {isActiveSprint && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
            <Zap className="size-2.5" />
            Active
          </span>
        )}

        <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {kindConf.label}
        </span>

        {backlog.status === "CLOSED" && (
          <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Closed
          </span>
        )}
        {backlog.is_default && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 uppercase tracking-wider">
            Default
          </span>
        )}

        {(start || end) && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-auto">
            <Calendar className="size-3" />
            {start && end ? `${start} – ${end}` : (start ?? end)}
          </span>
        )}

        <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
          <Hash className="size-3" />
          {total}
        </span>

        {isSprint && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
              TODO
              <span className="tabular-nums">{todoCount}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
              IN_PROGRESS
              <span className="tabular-nums">{inProgressCount}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
              DONE
              <span className="tabular-nums">{doneCount}</span>
            </span>
          </div>
        )}

        <div className="ml-1 flex items-center gap-1">
          {canCompleteSprint && (
            <Button
              variant="outline"
              size="xs"
              disabled={isSprintPending}
              title={
                unfinishedStoryCount > 0
                  ? `${unfinishedStoryCount} stories must be DONE before completing sprint`
                  : "Complete sprint"
              }
              onClick={() =>
                onCompleteSprint(backlog.id, backlog.name, unfinishedStoryCount)
              }
            >
              {isSprintPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CircleCheckBig className="size-3" />
              )}
              Complete sprint
            </Button>
          )}
          {canStartSprint && (
            <Button
              variant="outline"
              size="xs"
              disabled={isSprintPending || isStartBlockedByActive}
              title={
                isStartBlockedByActive
                  ? "Complete the current active sprint before starting another."
                  : "Start sprint"
              }
              onClick={() => onStartSprint(backlog.id, backlog.name)}
            >
              {isSprintPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Play className="size-3" />
              )}
              Start sprint
            </Button>
          )}

          {backlog.kind === "BACKLOG" && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onCreateStory(backlog.id)}
              title="Create story"
            >
              + Create
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            disabled={isBoardDeletePending || !canDeleteBoard}
            title={canDeleteBoard ? "Delete board" : "Default board cannot be deleted"}
            aria-label="Delete board"
            onClick={() => onDeleteBoard(backlog.id, backlog.name, backlog.is_default)}
          >
            {isBoardDeletePending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Row list */}
      {!collapsed && (
        <div className="border-t border-border/30">
          {stories.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">
              No stories in this backlog
            </p>
          ) : (
            <div className="divide-y divide-border/10">
              {stories.map((story) => (
                <BacklogRow
                  key={story.id}
                  item={story}
                  onClick={onStoryClick}
                  actions={(
                    <div className="flex items-center justify-end gap-1">
                      <StoryActionsMenu
                        storyId={story.id}
                        storyType={story.story_type}
                        storyKey={story.key}
                        storyTitle={story.title}
                        storyStatus={story.status}
                        onDelete={onStoryDelete}
                        onStatusChange={onStoryStatusChange}
                        onAddLabel={onStoryClick}
                        disabled={pendingStoryIds.has(story.id)}
                        isDeleting={pendingDeleteStoryIds.has(story.id)}
                      />
                      {(canAddToActiveSprint || canRemoveFromActiveSprint) ? (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={pendingStoryIds.has(story.id) || pendingDeleteStoryIds.has(story.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (canAddToActiveSprint) {
                            onAddToActiveSprint(story.id);
                            return;
                          }
                          onRemoveFromActiveSprint(story.id);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        title={
                          canAddToActiveSprint
                            ? "Add to active sprint"
                            : "Remove from active sprint"
                        }
                      >
                        {pendingStoryIds.has(story.id) || pendingDeleteStoryIds.has(story.id) ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : canAddToActiveSprint ? (
                          <ListPlus className="size-3" />
                        ) : (
                          <ListMinus className="size-3" />
                        )}
                        {canAddToActiveSprint ? "Add" : "Remove"}
                      </Button>
                      ) : null}
                    </div>
                  )}
                />
              ))}
            </div>
          )}

          <div className="border-t border-border/20 px-3 py-1.5">
            <Button
              variant="ghost"
              size="xs"
              disabled={backlog.kind !== "BACKLOG"}
              title={backlog.kind === "BACKLOG" ? "Create story" : "Only product backlog supports story creation"}
              className="text-muted-foreground"
              onClick={() => {
                if (backlog.kind === "BACKLOG") onCreateStory(backlog.id);
              }}
            >
              + Create
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

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
  const [createBoardName, setCreateBoardName] = useState("");
  const [createBoardKind, setCreateBoardKind] = useState<BacklogKind>("BACKLOG");
  const [createBoardGoal, setCreateBoardGoal] = useState("");
  const [createBoardStartDate, setCreateBoardStartDate] = useState("");
  const [createBoardEndDate, setCreateBoardEndDate] = useState("");
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [createBoardError, setCreateBoardError] = useState<string | null>(null);

  const handleStoryClick = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
  }, []);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) setSelectedStoryId(null);
  }, []);

  const showErrorToast = useCallback((message: string) => {
    setErrorToast(message);
  }, []);

  useEffect(() => {
    if (!errorToast) return;
    const timeoutId = window.setTimeout(() => {
      setErrorToast(null);
    }, 3500);
    return () => window.clearTimeout(timeoutId);
  }, [errorToast]);

  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1
      ? selectedProjectIds[0]
      : null;

  const fetchResult =
    singleProjectId && fetchResultState?.projectId === singleProjectId
      ? fetchResultState.result
      : null;

  // Derive state
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

  const filteredSections =
    state.kind === "ok"
      ? state.sections.map((section) => ({
          ...section,
          stories: applyPlanningStoryFilters(section.stories, filters),
        }))
      : [];
  const allStories = state.kind === "ok" ? state.sections.flatMap((section) => section.stories) : [];
  const statusOptions = buildStoryStatusOptions(allStories);
  const typeOptions = buildStoryTypeOptions(allStories);
  const labelOptions = buildStoryLabelOptions(allStories);
  const epicOptions = buildStoryEpicOptions(allStories);
  const assigneeOptions = [
    { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
    ...(state.kind === "ok" ? state.assignees : []),
  ];

  const totalStoryCount =
    state.kind === "ok"
      ? state.sections.reduce((acc, section) => acc + section.stories.length, 0)
      : 0;
  const visibleStoryCount =
    state.kind === "ok"
      ? filteredSections.reduce((acc, section) => acc + section.stories.length, 0)
      : 0;
  const totalTaskCount =
    state.kind === "ok"
      ? state.sections.reduce(
          (acc, section) =>
            acc + section.stories.reduce((taskAcc, story) => taskAcc + story.task_count, 0),
          0,
        )
      : 0;
  const visibleTaskCount =
    state.kind === "ok"
      ? filteredSections.reduce(
          (acc, section) =>
            acc + section.stories.reduce((taskAcc, story) => taskAcc + story.task_count, 0),
          0,
        )
      : 0;
  const totalWorkItems = totalStoryCount + totalTaskCount;
  const visibleWorkItems = visibleStoryCount + visibleTaskCount;
  const hasAnyActiveSprint =
    state.kind === "ok"
      ? state.sections.some(
          (section) =>
            section.backlog.kind === "SPRINT" && section.backlog.status === "ACTIVE",
        )
      : false;
  const activeSelectedStoryId =
    state.kind === "ok" &&
    selectedStoryId &&
    state.sections.some((section) =>
      section.stories.some((story) => story.id === selectedStoryId),
    )
      ? selectedStoryId
      : null;
  const selectedStoryLabels =
    state.kind === "ok" && activeSelectedStoryId
      ? state.sections
          .flatMap((section) => section.stories)
          .find((story) => story.id === activeSelectedStoryId)?.labels
      : undefined;

  const fetchBacklogResult = useCallback(async (projectId: string): Promise<FetchResult> => {
    const response = await fetch(
      apiUrl(`/v1/planning/backlogs?project_id=${projectId}&limit=100`),
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const json = await response.json();
    const backlogs: BacklogItem[] = excludeClosedSprintBacklogs(json.data ?? []);

    if (backlogs.length === 0) {
      return { kind: "empty" };
    }

    const sections: BacklogWithStories[] = await Promise.all(
      backlogs.map(async (backlog) => {
        const storiesResponse = await fetch(apiUrl(`/v1/planning/backlogs/${backlog.id}/stories`));
        if (!storiesResponse.ok) return { backlog, stories: [] };
        const body = await storiesResponse.json();
        return { backlog, stories: body.data ?? [] };
      }),
    );

    sections.sort((a, b) => {
      const aActive = a.backlog.kind === "SPRINT" && a.backlog.status === "ACTIVE" ? 1 : 0;
      const bActive = b.backlog.kind === "SPRINT" && b.backlog.status === "ACTIVE" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;

      const statusOrder = { ACTIVE: 0, CLOSED: 1 };
      const aStatus = statusOrder[a.backlog.status] ?? 0;
      const bStatus = statusOrder[b.backlog.status] ?? 0;
      if (aStatus !== bStatus) return aStatus - bStatus;

      const kindOrder = { SPRINT: 0, BACKLOG: 1, IDEAS: 2 };
      const aKind = kindOrder[a.backlog.kind] ?? 1;
      const bKind = kindOrder[b.backlog.kind] ?? 1;
      return aKind - bKind;
    });

    const agents = await fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name"))
      .then(async (res) => {
        if (!res.ok) return [] as PlanningAgentApiItem[];
        const body = (await res.json()) as { data?: PlanningAgentApiItem[] };
        return body.data ?? [];
      })
      .catch(() => [] as PlanningAgentApiItem[]);

    const assignees = agents
      .map((agent) => {
        const label = resolveAgentLabel(agent);
        return label && agent.id ? { value: agent.id, label } : null;
      })
      .filter((item): item is PlanningFilterOption => item !== null)
      .sort((a, b) => a.label.localeCompare(b.label));

    return { kind: "ok", sections, assignees };
  }, []);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) {
      throw new Error("Select a single project before refreshing.");
    }

    const result = await fetchBacklogResult(singleProjectId);
    setFetchResultState({
      projectId: singleProjectId,
      result,
    });
  }, [fetchBacklogResult, singleProjectId]);

  const updateSprintMembership = useCallback(
    async (storyId: string, operation: "add" | "remove") => {
      if (!singleProjectId) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        if (operation === "add") {
          await addStoryToActiveSprint(singleProjectId, storyId);
        } else {
          await removeStoryFromActiveSprint(singleProjectId, storyId);
        }
        await refreshCurrentView();
      } catch (error) {
        showErrorToast(
          error instanceof Error
            ? error.message
            : "Failed to update sprint membership.",
        );
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      }
    },
    [refreshCurrentView, showErrorToast, singleProjectId],
  );

  const updateSprintLifecycle = useCallback(
    async (backlogId: string, operation: SprintLifecycleOperation) => {
      if (!singleProjectId) return;
      setPendingSprintIds((prev) => ({ ...prev, [backlogId]: true }));
      try {
        if (operation === "start") {
          await startSprint(singleProjectId, backlogId);
        } else {
          await completeSprint(singleProjectId, backlogId);
        }
        emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId, operation });
        await refreshCurrentView();
      } catch (error) {
        showErrorToast(
          error instanceof Error ? error.message : "Failed to update sprint status.",
        );
      } finally {
        setPendingSprintIds((prev) => {
          const next = { ...prev };
          delete next[backlogId];
          return next;
        });
      }
    },
    [refreshCurrentView, showErrorToast, singleProjectId],
  );

  const handleAddToActiveSprint = useCallback(
    (storyId: string) => {
      void updateSprintMembership(storyId, "add");
    },
    [updateSprintMembership],
  );

  const handleRemoveFromActiveSprint = useCallback(
    (storyId: string) => {
      void updateSprintMembership(storyId, "remove");
    },
    [updateSprintMembership],
  );

  const handleCreateStory = useCallback((backlogId: string) => {
    setCreateBacklogId(backlogId);
  }, []);

  const handleStoryDelete = useCallback(
    async (storyId: string) => {
      if (pendingDeleteStoryIds[storyId]) return;
      setPendingDeleteStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        await deleteStory(storyId);
        if (selectedStoryId === storyId) {
          setSelectedStoryId(null);
        }
        await refreshCurrentView();
      } catch (error) {
        showErrorToast(
          error instanceof Error ? error.message : "Failed to delete story.",
        );
      } finally {
        setPendingDeleteStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      }
    },
    [pendingDeleteStoryIds, refreshCurrentView, selectedStoryId, showErrorToast],
  );

  const handleStoryStatusChange = useCallback(
    async (storyId: string, status: ItemStatus) => {
      if (pendingStoryIds[storyId] || pendingDeleteStoryIds[storyId]) return;
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
        showErrorToast(
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
    [pendingDeleteStoryIds, pendingStoryIds, refreshCurrentView, showErrorToast],
  );

  const handleStartSprint = useCallback(
    (backlogId: string, backlogName: string) => {
      const confirmed = window.confirm(
        `Start sprint "${backlogName}"?\n\nThis sprint will become the active sprint board.`,
      );
      if (!confirmed) return;
      void updateSprintLifecycle(backlogId, "start");
    },
    [updateSprintLifecycle],
  );

  const handleCompleteSprint = useCallback(
    (backlogId: string, backlogName: string, unfinishedStoryCount: number) => {
      if (unfinishedStoryCount > 0) {
        const noun = unfinishedStoryCount === 1 ? "story is" : "stories are";
        showErrorToast(
          `Cannot complete sprint "${backlogName}". ${unfinishedStoryCount} ${noun} not DONE.`,
        );
        return;
      }

      const confirmed = window.confirm(
        `Complete sprint "${backlogName}"?\n\nThis will close the sprint and remove it from the active board.`,
      );
      if (!confirmed) return;
      void updateSprintLifecycle(backlogId, "complete");
    },
    [showErrorToast, updateSprintLifecycle],
  );

  const handleCreateDialogChange = useCallback((open: boolean) => {
    if (!open) setCreateBacklogId(null);
  }, []);

  const resetCreateBoardForm = useCallback(() => {
    setCreateBoardName("");
    setCreateBoardKind("BACKLOG");
    setCreateBoardGoal("");
    setCreateBoardStartDate("");
    setCreateBoardEndDate("");
    setCreateBoardError(null);
  }, []);

  const handleCreateBoardDialogChange = useCallback(
    (open: boolean) => {
      setCreateBoardOpen(open);
      if (!open) resetCreateBoardForm();
    },
    [resetCreateBoardForm],
  );

  const handleCreateBoardKindChange = useCallback((kind: BacklogKind) => {
    setCreateBoardKind(kind);
    setCreateBoardError(null);
    if (kind !== "SPRINT") {
      setCreateBoardGoal("");
      setCreateBoardStartDate("");
      setCreateBoardEndDate("");
    }
  }, []);

  const handleStorySaved = useCallback(() => {
    setCreateBacklogId(null);
    void refreshCurrentView().catch((error) => {
      showErrorToast(
        error instanceof Error ? error.message : "Failed to refresh backlog data.",
      );
    });
  }, [refreshCurrentView, showErrorToast]);

  const handleCreateBoardSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!singleProjectId || isCreatingBoard) return;

      const trimmedName = createBoardName.trim();
      if (trimmedName.length === 0) {
        setCreateBoardError("Board name is required.");
        return;
      }

      if (
        createBoardKind === "SPRINT" &&
        createBoardStartDate &&
        createBoardEndDate &&
        createBoardStartDate > createBoardEndDate
      ) {
        setCreateBoardError("Sprint end date must be on or after start date.");
        return;
      }

      setIsCreatingBoard(true);
      setCreateBoardError(null);

      try {
        await createBoard({
          projectId: singleProjectId,
          name: trimmedName,
          kind: createBoardKind,
          goal:
            createBoardKind === "SPRINT" && createBoardGoal.trim().length > 0
              ? createBoardGoal.trim()
              : null,
          startDate:
            createBoardKind === "SPRINT" && createBoardStartDate
              ? createBoardStartDate
              : null,
          endDate:
            createBoardKind === "SPRINT" && createBoardEndDate
              ? createBoardEndDate
              : null,
        });
        setCreateBoardOpen(false);
        resetCreateBoardForm();
        await refreshCurrentView();
      } catch (error) {
        setCreateBoardError(
          error instanceof Error ? error.message : "Failed to create board.",
        );
      } finally {
        setIsCreatingBoard(false);
      }
    },
    [
      createBoardEndDate,
      createBoardGoal,
      createBoardKind,
      createBoardName,
      createBoardStartDate,
      isCreatingBoard,
      resetCreateBoardForm,
      refreshCurrentView,
      singleProjectId,
    ],
  );

  const handleDeleteBoard = useCallback(
    async (backlogId: string, backlogName: string, isDefault: boolean) => {
      if (isDefault) {
        showErrorToast("Default board cannot be deleted.");
        return;
      }

      const confirmed = window.confirm(
        `Delete board "${backlogName}"?\n\nThis action cannot be undone.`,
      );
      if (!confirmed) return;

      setPendingBoardIds((prev) => ({ ...prev, [backlogId]: true }));
      try {
        await deleteBoard(backlogId);
        await refreshCurrentView();
      } catch (error) {
        showErrorToast(
          error instanceof Error ? error.message : "Failed to delete board.",
        );
      } finally {
        setPendingBoardIds((prev) => {
          const next = { ...prev };
          delete next[backlogId];
          return next;
        });
      }
    },
    [refreshCurrentView, showErrorToast],
  );

  useEffect(() => {
    if (!singleProjectId) return;

    let cancelled = false;

    void fetchBacklogResult(singleProjectId)
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
          result: { kind: "error", message: String(error) },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchBacklogResult, singleProjectId]);

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
        icon={Layers}
        title="Backlog"
        subtitle="All backlogs and their stories for the selected project."
        controls={
          singleProjectId ? (
            <div className="flex w-full flex-wrap items-center gap-2">
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
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCreateBoardDialogChange(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Create board
              </Button>
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
          icon="backlog"
          title="Select a project"
          description="Choose a single project from the selector above to view its backlogs."
        />
      )}

      {state.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {state.kind === "empty" && (
        <EmptyState
          icon="backlog"
          title="No backlogs"
          description="This project has no backlogs yet. Create a backlog or sprint to get started."
        />
      )}

      {state.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load backlogs"
          description={state.message}
        />
      )}

      {state.kind === "ok" && (
        <div className="flex flex-col gap-3">
          {filteredSections.map((section) => (
            <BacklogSection
              key={section.backlog.id}
              section={section}
              isActiveSprint={
                section.backlog.kind === "SPRINT" &&
                section.backlog.status === "ACTIVE"
              }
              hasAnyActiveSprint={hasAnyActiveSprint}
              onStoryClick={handleStoryClick}
              onAddToActiveSprint={handleAddToActiveSprint}
              onRemoveFromActiveSprint={handleRemoveFromActiveSprint}
              onStartSprint={handleStartSprint}
              onCompleteSprint={handleCompleteSprint}
              onCreateStory={handleCreateStory}
              onStoryDelete={handleStoryDelete}
              onStoryStatusChange={handleStoryStatusChange}
              onDeleteBoard={handleDeleteBoard}
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

      <StoryDetailDialog
        storyId={activeSelectedStoryId}
        open={activeSelectedStoryId !== null}
        onOpenChange={handleDialogClose}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={() => {
          void refreshCurrentView().catch((error) => {
            showErrorToast(
              error instanceof Error ? error.message : "Failed to refresh backlog data.",
            );
          });
        }}
      />

      <Dialog open={createBacklogId !== null} onOpenChange={handleCreateDialogChange}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create story</DialogTitle>
          </DialogHeader>
          {singleProjectId && createBacklogId && (
            <StoryForm
              mode="create"
              projectId={singleProjectId}
              backlogId={createBacklogId}
              onSaved={handleStorySaved}
              onCancel={() => setCreateBacklogId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createBoardOpen} onOpenChange={handleCreateBoardDialogChange}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create board</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateBoardSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="board-name" className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <input
                id="board-name"
                type="text"
                value={createBoardName}
                onChange={(event) => {
                  setCreateBoardName(event.target.value);
                  if (createBoardError) setCreateBoardError(null);
                }}
                placeholder="e.g. Sprint 14"
                autoComplete="off"
                className={cn(
                  "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                  "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
                disabled={isCreatingBoard}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="board-kind" className="text-xs font-medium text-muted-foreground">
                Kind
              </label>
              <select
                id="board-kind"
                value={createBoardKind}
                onChange={(event) =>
                  handleCreateBoardKindChange(event.target.value as BacklogKind)
                }
                className={cn(
                  "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
                disabled={isCreatingBoard}
              >
                {BOARD_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {createBoardKind === "SPRINT" && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="board-goal" className="text-xs font-medium text-muted-foreground">
                    Goal (optional)
                  </label>
                  <input
                    id="board-goal"
                    type="text"
                    value={createBoardGoal}
                    onChange={(event) => setCreateBoardGoal(event.target.value)}
                    placeholder="Sprint goal"
                    autoComplete="off"
                    className={cn(
                      "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                      "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    )}
                    disabled={isCreatingBoard}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="board-start-date" className="text-xs font-medium text-muted-foreground">
                      Start date (optional)
                    </label>
                    <input
                      id="board-start-date"
                      type="date"
                      value={createBoardStartDate}
                      onChange={(event) => setCreateBoardStartDate(event.target.value)}
                      className={cn(
                        "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      )}
                      disabled={isCreatingBoard}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="board-end-date" className="text-xs font-medium text-muted-foreground">
                      End date (optional)
                    </label>
                    <input
                      id="board-end-date"
                      type="date"
                      value={createBoardEndDate}
                      onChange={(event) => setCreateBoardEndDate(event.target.value)}
                      className={cn(
                        "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      )}
                      disabled={isCreatingBoard}
                    />
                  </div>
                </div>
              </>
            )}

            {createBoardError && (
              <p role="alert" className="text-xs text-red-400">
                {createBoardError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleCreateBoardDialogChange(false)}
                disabled={isCreatingBoard}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingBoard}>
                {isCreatingBoard ? (
                  <>
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create board"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function BacklogPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <BacklogPageContent />
    </Suspense>
  );
}
