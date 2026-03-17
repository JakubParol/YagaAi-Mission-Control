"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Target } from "lucide-react";

import type { ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
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
import { EmptyState } from "@/components/empty-state";
import { SprintBoard } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { deleteStory } from "../story-actions";
import {
  createTodoQuickItem,
  type QuickCreateAssigneeOption,
  type QuickCreateSubmitInput,
} from "./quick-create";
import { applyOptimisticStoryStatus, rollbackStoryStatus } from "./status-updates";
import { subscribeToSprintLifecycleChanged } from "../sprint-lifecycle-events";
import {
  fetchBoardState,
  fetchAssigneeOptions,
  patchStoryStatus,
  patchStoryAssignee,
  type BoardState,
} from "./board-page-actions";

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

  const viewState: BoardState = !singleProjectId
    ? { kind: "no-project" }
    : state.kind !== "no-project" && state.projectId === singleProjectId
      ? state
      : { kind: "loading", projectId: singleProjectId };

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

  const visibleState: BoardState =
    viewState.kind === "ok"
      ? {
          ...viewState,
          data: {
            ...viewState.data,
            stories: applyPlanningStoryFilters(viewState.data.stories, filters),
          },
        }
      : viewState;
  const allStories = viewState.kind === "ok" ? viewState.data.stories : [];
  const statusOptions = buildStoryStatusOptions(allStories);
  const typeOptions = buildStoryTypeOptions(allStories);
  const labelOptions = buildStoryLabelOptions(allStories);
  const epicOptions = buildStoryEpicOptions(allStories);
  const assigneeFilterOptions = [
    { value: UNASSIGNED_FILTER_VALUE, label: "Unassigned" },
    ...assigneeOptions.map((option) => ({
      value: option.id,
      label: option.role ? `${option.name} · ${option.role}` : option.name,
    })),
  ];

  const selectedStoryLabels =
    state.kind === "ok" && selectedStoryId
      ? state.data.stories.find((story) => story.id === selectedStoryId)?.labels
      : undefined;
  const boardSummary = visibleState.kind === "ok"
    ? (() => {
        const total = visibleState.data.stories.length;
        const done = visibleState.data.stories.filter((story) => story.status === "DONE").length;
        const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;
        return {
          sprintName: visibleState.data.backlog.name,
          total,
          done,
          pctDone,
        };
      })()
    : null;

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
      .then((nextState) => {
        if (cancelled) return;
        setState(nextState);
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          kind: "error",
          projectId: singleProjectId,
          message: String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [loadBoardState, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) {
      setAssigneeOptions([]);
      return;
    }

    let cancelled = false;
    fetchAssigneeOptions()
      .then((parsed) => {
        if (!cancelled) setAssigneeOptions(parsed);
      })
      .catch(() => {
        if (!cancelled) setAssigneeOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    return subscribeToSprintLifecycleChanged((payload) => {
      if (payload.projectId !== singleProjectId) return;
      void refreshCurrentView().catch(() => undefined);
    });
  }, [refreshCurrentView, singleProjectId]);

  const handleStoryStatusChange = useCallback(
    async (storyId: string, nextStatus: ItemStatus) => {
      if (state.kind !== "ok") return;
      const existingStory = state.data.stories.find((item) => item.id === storyId);
      if (!existingStory || existingStory.status === nextStatus) return;
      const previousStatus: ItemStatus = existingStory.status;

      setState((prevState) => {
        if (prevState.kind !== "ok") return prevState;
        const result = applyOptimisticStoryStatus(prevState.data, storyId, nextStatus);
        if (!result.previousStatus) return prevState;
        return {
          ...prevState,
          data: result.data,
        };
      });

      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await patchStoryStatus(storyId, nextStatus);
      } catch {
        setState((prevState) => {
          if (prevState.kind !== "ok") return prevState;
          return {
            ...prevState,
            data: rollbackStoryStatus(prevState.data, storyId, previousStatus),
          };
        });
        showErrorToast("Failed to update story status. Changes were rolled back.");
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      }
    },
    [showErrorToast, state],
  );

  const handleTodoQuickCreate = useCallback(
    async (input: Omit<QuickCreateSubmitInput, "projectId">) => {
      if (!singleProjectId) {
        throw new Error("Select a single project before creating work.")
      }

      const created = await createTodoQuickItem({
        ...input,
        projectId: singleProjectId,
      })
      const selectedAssignee =
        assigneeOptions.find((option) => option.id === input.assigneeAgentId) ?? null;
      const createdWithAssignee = {
        ...created,
        assignee_agent_id: input.assigneeAgentId,
        assignee_name: selectedAssignee?.name ?? null,
        assignee_last_name: selectedAssignee?.last_name ?? null,
        assignee_initials: selectedAssignee?.initials ?? null,
        assignee_avatar: selectedAssignee?.avatar ?? null,
      };

      setState((prevState) => {
        if (prevState.kind !== "ok" || prevState.projectId !== singleProjectId) {
          return prevState
        }

        const shiftedStories = prevState.data.stories.map((story) =>
          story.status === "TODO" ? { ...story, position: story.position + 1 } : story,
        )

        return {
          ...prevState,
          data: {
            ...prevState.data,
            stories: [createdWithAssignee, ...shiftedStories],
          },
        }
      })
    },
    [assigneeOptions, singleProjectId],
  )

  const handleStoryDelete = useCallback(
    async (storyId: string) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;
      const projectId = state.projectId;

      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await deleteStory(storyId);
        if (selectedStoryId === storyId) {
          setSelectedStoryId(null);
        }
        const nextState = await loadBoardState(projectId);
        setState(nextState);
      } catch (error) {
        showErrorToast(
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
    [loadBoardState, pendingStoryIds, selectedStoryId, showErrorToast, state],
  );

  const handleStoryAssigneeChange = useCallback(
    async (storyId: string, assigneeAgentId: string | null) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;

      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await patchStoryAssignee(storyId, assigneeAgentId);
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
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

      <PlanningTopShell
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
              statusOptions={statusOptions}
              typeOptions={typeOptions}
              labelOptions={labelOptions}
              epicOptions={epicOptions}
              assigneeOptions={assigneeFilterOptions}
            />
          ) : null
        }
        actions={(
          <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
            <PlanningRefreshControl
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
        <EmptyState
          icon="board"
          title="Select a project"
          description="Choose a single project from the selector above to view its active sprint board."
        />
      )}

      {visibleState.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {visibleState.kind === "no-sprint" && (
        <EmptyState
          icon="board"
          title="No active sprint"
          description="This project has no active sprint. Create a sprint and set it to ACTIVE to see stories on the board."
        />
      )}

      {visibleState.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load sprint"
          description={visibleState.message}
        />
      )}

      {visibleState.kind === "ok" && (
        <SprintBoard
          data={visibleState.data}
          onStoryClick={handleStoryClick}
          onStoryStatusChange={handleStoryStatusChange}
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
        onOpenChange={handleDialogClose}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={() => {
          void refreshCurrentView().catch(() => undefined);
        }}
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
