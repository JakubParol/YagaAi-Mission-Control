export interface StoryWithLabelIds {
  label_ids?: string[] | null;
  labels?: Array<{ id: string }> | null;
}

export function extractStoryLabelIds(story: StoryWithLabelIds): string[] {
  if (Array.isArray(story.label_ids) && story.label_ids.length > 0) {
    return story.label_ids;
  }
  if (!Array.isArray(story.labels) || story.labels.length === 0) {
    return [];
  }
  return story.labels.map((label) => label.id);
}

export function matchesSelectedStoryLabels(
  story: StoryWithLabelIds,
  selectedLabelIds: readonly string[],
): boolean {
  if (selectedLabelIds.length === 0) return true;
  const storyLabelIds = extractStoryLabelIds(story);
  if (storyLabelIds.length === 0) return false;
  return selectedLabelIds.some((id) => storyLabelIds.includes(id));
}

export function filterStoriesBySelectedLabels<T extends StoryWithLabelIds>(
  stories: readonly T[],
  selectedLabelIds: readonly string[],
): T[] {
  if (selectedLabelIds.length === 0) return [...stories];
  return stories.filter((story) => matchesSelectedStoryLabels(story, selectedLabelIds));
}
