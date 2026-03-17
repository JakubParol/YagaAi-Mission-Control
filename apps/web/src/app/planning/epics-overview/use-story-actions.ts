/**
 * Hook that manages story-level mutations (status change, add-to-sprint),
 * pending state, optimistic cache updates, and error tracking.
 */

import { useCallback, useState } from "react";

import type { WorkItemStatus } from "@/lib/planning/types";

import { type PreviewState } from "./epic-row";
import {
  addStoryToSprint as addStoryToSprintAction,
  changeStoryStatus as changeStoryStatusAction,
} from "./epics-page-actions";
import {
  EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS,
  type EpicOverviewStoryPreview,
  type EpicOverviewStoryPreviewFilters,
} from "./overview-types";

export interface StoryActionsState {
  storyPendingById: Record<string, boolean>;
  storyErrorByEpicKey: Record<string, string>;
  previewFiltersByEpicKey: Record<string, EpicOverviewStoryPreviewFilters>;
  expandedByEpicKey: Record<string, boolean>;
}

export interface StoryActionsCallbacks {
  handleToggleExpand: (epicKey: string) => void;
  handlePreviewFilterChange: (epicKey: string, patch: Partial<EpicOverviewStoryPreviewFilters>) => void;
  handleChangeStoryStatus: (epicKey: string, story: EpicOverviewStoryPreview, nextStatus: WorkItemStatus) => void;
  handleAddStoryToSprint: (epicKey: string, story: EpicOverviewStoryPreview) => void;
  resetAll: () => void;
}

export function useStoryActions(
  singleProjectId: string | null,
  setPreviewByEpicKey: React.Dispatch<React.SetStateAction<Record<string, PreviewState>>>,
): StoryActionsState & StoryActionsCallbacks {
  const [storyPendingById, setStoryPendingById] = useState<Record<string, boolean>>({});
  const [storyErrorByEpicKey, setStoryErrorByEpicKey] = useState<Record<string, string>>({});
  const [previewFiltersByEpicKey, setPreviewFiltersByEpicKey] = useState<
    Record<string, EpicOverviewStoryPreviewFilters>
  >({});
  const [expandedByEpicKey, setExpandedByEpicKey] = useState<Record<string, boolean>>({});

  const resetAll = useCallback(() => {
    setStoryPendingById({});
    setStoryErrorByEpicKey({});
    setPreviewFiltersByEpicKey({});
    setExpandedByEpicKey({});
  }, []);

  const markStoryPending = useCallback((storyId: string, pending: boolean) => {
    setStoryPendingById((current) => {
      if (pending) return { ...current, [storyId]: true };
      if (!current[storyId]) return current;
      const next = { ...current };
      delete next[storyId];
      return next;
    });
  }, []);

  const updateCachedStory = useCallback((
    epicKey: string,
    storyId: string,
    patch: Partial<EpicOverviewStoryPreview>,
  ) => {
    setPreviewByEpicKey((current) => {
      const entry = current[epicKey];
      if (!entry || entry.kind !== "ready") return current;
      return {
        ...current,
        [epicKey]: {
          kind: "ready",
          stories: entry.stories.map((s) => (s.story_id === storyId ? { ...s, ...patch } : s)),
        },
      };
    });
  }, [setPreviewByEpicKey]);

  const clearStoryError = useCallback((epicKey: string) => {
    setStoryErrorByEpicKey((current) => {
      if (!current[epicKey]) return current;
      const next = { ...current };
      delete next[epicKey];
      return next;
    });
  }, []);

  const setStoryError = useCallback((epicKey: string, message: string) => {
    setStoryErrorByEpicKey((current) => ({ ...current, [epicKey]: message }));
  }, []);

  const handleToggleExpand = useCallback((epicKey: string) => {
    setExpandedByEpicKey((current) => ({ ...current, [epicKey]: !current[epicKey] }));
  }, []);

  const handlePreviewFilterChange = useCallback(
    (epicKey: string, patch: Partial<EpicOverviewStoryPreviewFilters>) => {
      setPreviewFiltersByEpicKey((current) => ({
        ...current,
        [epicKey]: { ...(current[epicKey] ?? EPIC_OVERVIEW_DEFAULT_STORY_PREVIEW_FILTERS), ...patch },
      }));
    },
    [],
  );

  const handleChangeStoryStatus = useCallback((
    epicKey: string,
    story: EpicOverviewStoryPreview,
    nextStatus: WorkItemStatus,
  ) => {
    if (storyPendingById[story.story_id]) return;
    markStoryPending(story.story_id, true);
    clearStoryError(epicKey);

    void changeStoryStatusAction(story.story_id, nextStatus)
      .then(({ timestamp }) => {
        updateCachedStory(epicKey, story.story_id, {
          status: nextStatus,
          updated_at: timestamp ?? story.updated_at,
        });
      })
      .catch((error: unknown) => {
        setStoryError(epicKey, error instanceof Error ? error.message : "Failed to update story status.");
      })
      .finally(() => { markStoryPending(story.story_id, false); });
  }, [clearStoryError, markStoryPending, setStoryError, storyPendingById, updateCachedStory]);

  const handleAddStoryToSprint = useCallback((
    epicKey: string,
    story: EpicOverviewStoryPreview,
  ) => {
    if (!singleProjectId) {
      setStoryError(epicKey, "Select a single project before adding a story to sprint.");
      return;
    }
    if (storyPendingById[story.story_id]) return;
    markStoryPending(story.story_id, true);
    clearStoryError(epicKey);

    void addStoryToSprintAction(story.story_id, singleProjectId)
      .then(({ timestamp }) => {
        updateCachedStory(epicKey, story.story_id, { updated_at: timestamp ?? story.updated_at });
      })
      .catch((error: unknown) => {
        setStoryError(epicKey, error instanceof Error ? error.message : "Failed to add story to sprint.");
      })
      .finally(() => { markStoryPending(story.story_id, false); });
  }, [clearStoryError, markStoryPending, setStoryError, singleProjectId, storyPendingById, updateCachedStory]);

  return {
    storyPendingById,
    storyErrorByEpicKey,
    previewFiltersByEpicKey,
    expandedByEpicKey,
    handleToggleExpand,
    handlePreviewFilterChange,
    handleChangeStoryStatus,
    handleAddStoryToSprint,
    resetAll,
  };
}
