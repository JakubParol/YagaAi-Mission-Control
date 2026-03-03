"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  ListPlus,
  MoreHorizontal,
  Hash,
  Layers,
  Loader2,
  ListMinus,
  Play,
  Search,
  Zap,
} from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { BacklogKind, BacklogStatus, ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import type { StoryCardStory } from "@/components/planning/story-card";
import { BacklogRow } from "@/components/planning/backlog-row";
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
import { matchesSelectedStoryLabels } from "@/components/planning/story-label-filter";
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
  | { kind: "ok"; sections: BacklogWithStories[] };

type FetchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; sections: BacklogWithStories[] };

// ─── Helpers ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<BacklogKind, { label: string; accent: string }> = {
  SPRINT: { label: "Sprint", accent: "border-l-blue-500" },
  BACKLOG: { label: "Backlog", accent: "border-l-slate-500" },
  IDEAS: { label: "Ideas", accent: "border-l-violet-500" },
};

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
  pendingStoryIds,
  pendingSprintIds,
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
  pendingStoryIds: ReadonlySet<string>;
  pendingSprintIds: ReadonlySet<string>;
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
  const isStartBlockedByActive = canStartSprint && hasAnyActiveSprint;
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
            disabled
            title="Coming soon"
            aria-label="More section actions"
          >
            <MoreHorizontal className="size-3" />
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
                  actions={
                    canAddToActiveSprint || canRemoveFromActiveSprint ? (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={pendingStoryIds.has(story.id)}
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
                        {pendingStoryIds.has(story.id) ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : canAddToActiveSprint ? (
                          <ListPlus className="size-3" />
                        ) : (
                          <ListMinus className="size-3" />
                        )}
                        {canAddToActiveSprint ? "Add" : "Remove"}
                      </Button>
                    ) : null
                  }
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

export default function BacklogPage() {
  const { selectedProjectIds, allSelected, selectedLabelIds } = usePlanningFilter();
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [pendingSprintIds, setPendingSprintIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [createBacklogId, setCreateBacklogId] = useState<string | null>(null);
  const prevProjectRef = useRef<string | null>(null);

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

  // Reset fetch result when project changes (synchronous, no effect needed)
  if (prevProjectRef.current !== singleProjectId) {
    prevProjectRef.current = singleProjectId;
    setFetchResult(null);
    setPendingStoryIds({});
    setPendingSprintIds({});
  }

  // Derive state
  const state: PageState = !singleProjectId
    ? { kind: "no-project" }
    : fetchResult === null
      ? { kind: "loading" }
      : fetchResult;

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSections =
    state.kind === "ok"
      ? state.sections.map((section) => ({
          ...section,
          stories:
            normalizedSearchQuery.length === 0 && selectedLabelIds.length === 0
              ? section.stories
              : section.stories.filter((story) => {
                  const key = (story.key ?? "").toLowerCase();
                  const title = story.title.toLowerCase();
                  const matchesSearch =
                    normalizedSearchQuery.length === 0 ||
                    key.includes(normalizedSearchQuery) ||
                    title.includes(normalizedSearchQuery);
                  const matchesLabels = matchesSelectedStoryLabels(
                    story,
                    selectedLabelIds,
                  );
                  return matchesSearch && matchesLabels;
                }),
        }))
      : [];

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
        setReloadToken((prev) => prev + 1);
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
    [showErrorToast, singleProjectId],
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
        setReloadToken((prev) => prev + 1);
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
    [showErrorToast, singleProjectId],
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

  const handleStorySaved = useCallback(() => {
    setCreateBacklogId(null);
    setReloadToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!singleProjectId) return;

    let cancelled = false;

    fetch(
      apiUrl(
        `/v1/planning/backlogs?project_id=${singleProjectId}&limit=100`,
      ),
    )
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then(async (json) => {
        if (cancelled) return;
        const backlogs: BacklogItem[] = excludeClosedSprintBacklogs(json.data ?? []);

        if (backlogs.length === 0) {
          setFetchResult({ kind: "empty" });
          return;
        }

        // Fetch stories for each backlog in parallel
        const sections: BacklogWithStories[] = await Promise.all(
          backlogs.map(async (backlog) => {
            const res = await fetch(
              apiUrl(`/v1/planning/backlogs/${backlog.id}/stories`),
            );
            if (!res.ok) return { backlog, stories: [] };
            const body = await res.json();
            return { backlog, stories: body.data ?? [] };
          }),
        );

        if (cancelled) return;

        // Sort: active sprints first, then by kind, closed last
        sections.sort((a, b) => {
          const aActive =
            a.backlog.kind === "SPRINT" && a.backlog.status === "ACTIVE"
              ? 1
              : 0;
          const bActive =
            b.backlog.kind === "SPRINT" && b.backlog.status === "ACTIVE"
              ? 1
              : 0;
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

        setFetchResult({ kind: "ok", sections });
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchResult({ kind: "error", message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, singleProjectId]);

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

      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Layers className="size-6 text-muted-foreground" />
          <h1 className="text-3xl font-bold text-foreground">Backlog</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          All backlogs and their stories for the selected project.
        </p>
      </div>

      {state.kind === "ok" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search backlog"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={cn(
                "h-8 w-full rounded-md border border-border/60 bg-background pl-8 pr-3 text-sm text-foreground",
                "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            />
          </div>
          {selectedLabelIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Label filter: {selectedLabelIds.length} selected
            </p>
          )}
        </div>
      )}

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
              pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
              pendingSprintIds={new Set(Object.keys(pendingSprintIds))}
            />
          ))}

          <div className="mt-1 rounded-md border border-border/40 bg-card/20 px-3 py-2 text-xs text-muted-foreground">
            {visibleWorkItems} of {totalWorkItems} work items visible | Estimate: - of -
          </div>
        </div>
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={handleDialogClose}
        onStoryUpdated={() => setReloadToken((prev) => prev + 1)}
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
    </>
  );
}
