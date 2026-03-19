export interface StoryDetailShellStateParams {
  embedded?: boolean;
  open?: boolean;
  storyId: string | null;
}

export interface StoryDetailShellState {
  isActive: boolean;
  fullPageHref: string | null;
  deleteRedirectHref: string;
}

export function getWorkItemPageHref(storyId: string | null): string | null {
  return storyId ? `/planning/work-items/${storyId}` : null;
}

export function getStoryDetailDeleteRedirectHref(): string {
  return "/planning/list";
}

export function getStoryDetailShellState({
  embedded = false,
  open = false,
  storyId,
}: StoryDetailShellStateParams): StoryDetailShellState {
  return {
    isActive: embedded ? storyId !== null : open,
    fullPageHref: embedded ? null : getWorkItemPageHref(storyId),
    deleteRedirectHref: getStoryDetailDeleteRedirectHref(),
  };
}
