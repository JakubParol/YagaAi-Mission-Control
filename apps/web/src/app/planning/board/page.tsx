"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { EmptyState } from "@/components/empty-state";
import { filterStoriesBySelectedLabels } from "@/components/planning/story-label-filter";
import { SprintBoard, type ActiveSprintData } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { deleteStory } from "../story-actions";
import {
  createTodoQuickItem,
  type QuickCreateAssigneeOption,
  type QuickCreateSubmitInput,
} from "./quick-create";
import { applyOptimisticStoryStatus, rollbackStoryStatus } from "./status-updates";
import { subscribeToSprintLifecycleChanged } from "../sprint-lifecycle-events";

type BoardState =
  | { kind: "no-project" }
  | { kind: "loading"; projectId: string }
  | { kind: "no-sprint"; projectId: string }
  | { kind: "error"; projectId: string; message: string }
  | { kind: "ok"; projectId: string; data: ActiveSprintData };

interface AgentListEnvelope {
  data?: Array<{
    id?: string;
    name?: string;
    last_name?: string | null;
    initials?: string | null;
    role?: string | null;
    avatar?: string | null;
    openclaw_key?: string;
  }>;
}

export default function BoardPage() {
  const { selectedProjectIds, allSelected, selectedLabelIds } = usePlanningFilter();
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

  const visibleState: BoardState =
    viewState.kind === "ok"
      ? {
          ...viewState,
          data: {
            ...viewState.data,
            stories: filterStoriesBySelectedLabels(viewState.data.stories, selectedLabelIds),
          },
        }
      : viewState;
  const selectedStoryLabels =
    state.kind === "ok" && selectedStoryId
      ? state.data.stories.find((story) => story.id === selectedStoryId)?.labels
      : undefined;

  const fetchBoardState = useCallback(async (projectId: string): Promise<BoardState> => {
    setPendingStoryIds({});
    const response = await fetch(
      apiUrl(`/v1/planning/backlogs/active-sprint?project_id=${projectId}`),
    );

    if (response.status === 404) {
      return { kind: "no-sprint", projectId };
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const json = await response.json();
    return { kind: "ok", projectId, data: json.data };
  }, []);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) {
      throw new Error("Select a single project before refreshing.");
    }
    const nextState = await fetchBoardState(singleProjectId);
    setState(nextState);
  }, [fetchBoardState, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;

    let cancelled = false;

    void fetchBoardState(singleProjectId)
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
  }, [fetchBoardState, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) {
      setAssigneeOptions([]);
      return;
    }

    let cancelled = false;
    fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name"))
      .then((response) => {
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        const body = json as AgentListEnvelope;
        const parsed = (body.data ?? [])
          .filter((item) => item.id && item.name && item.openclaw_key)
          .map((item) => ({
            id: item.id!,
            name: item.name!,
            last_name: item.last_name ?? null,
            initials: item.initials ?? null,
            role: item.role ?? null,
            avatar: item.avatar ?? null,
            openclaw_key: item.openclaw_key!,
          }));
        setAssigneeOptions(parsed);
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
        const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        const fallbackStatus = previousStatus;
        setState((prevState) => {
          if (prevState.kind !== "ok") return prevState;
          return {
            ...prevState,
            data: rollbackStoryStatus(prevState.data, storyId, fallbackStatus),
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
        const nextState = await fetchBoardState(projectId);
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
    [fetchBoardState, pendingStoryIds, selectedStoryId, showErrorToast, state],
  );

  const handleStoryAssigneeChange = useCallback(
    async (storyId: string, assigneeAgentId: string | null) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;

      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_assignee_agent_id: assigneeAgentId }),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
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
        title="Board"
        subtitle="Active sprint board for the selected project."
        context={
          selectedLabelIds.length > 0
            ? `Filtered by ${selectedLabelIds.length} label${selectedLabelIds.length === 1 ? "" : "s"}.`
            : undefined
        }
        actions={(
          <PlanningRefreshControl
            onRefresh={refreshCurrentView}
            disabled={!singleProjectId}
            className="items-stretch sm:items-end"
          />
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
