import type { WorkItemStatus } from "@/lib/planning/types";

export interface StoryWithStatus {
  id: string;
  status: WorkItemStatus;
}

export interface ActiveSprintDataLike<TStory extends StoryWithStatus = StoryWithStatus> {
  backlog: unknown;
  stories: TStory[];
}

export function applyOptimisticStoryStatus<
  TStory extends StoryWithStatus,
  TData extends ActiveSprintDataLike<TStory>,
>(
  data: TData,
  storyId: string,
  nextStatus: WorkItemStatus,
): { data: TData; previousStatus: WorkItemStatus | null } {
  const story = data.stories.find((item) => item.id === storyId);
  if (!story || story.status === nextStatus) {
    return { data, previousStatus: null };
  }

  return {
    previousStatus: story.status,
    data: {
      ...data,
      stories: data.stories.map((item) =>
        item.id === storyId ? { ...item, status: nextStatus } : item,
      ),
    },
  };
}

export function rollbackStoryStatus<
  TStory extends StoryWithStatus,
  TData extends ActiveSprintDataLike<TStory>,
>(
  data: TData,
  storyId: string,
  previousStatus: WorkItemStatus,
): TData {
  return {
    ...data,
    stories: data.stories.map((item) =>
      item.id === storyId ? { ...item, status: previousStatus } : item,
    ),
  } as TData;
}
