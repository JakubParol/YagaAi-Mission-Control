export interface ProjectSelectorItem {
  id: string;
  key: string;
  name: string;
  is_default: boolean;
}

export interface InitialProjectSelectionInput {
  projects: ProjectSelectorItem[];
  selectedProjectIds: string[];
  projectKeyFromUrl: string | null;
}

export interface InitialProjectSelection {
  targetProject: ProjectSelectorItem;
  shouldUpdateUrl: boolean;
}

/**
 * Select initial project with precedence:
 * 1) exact URL match
 * 2) project marked as default
 * 3) first project in list
 */
export function resolveInitialProjectSelection(
  input: InitialProjectSelectionInput,
): InitialProjectSelection | null {
  const { projects, selectedProjectIds, projectKeyFromUrl } = input;

  if (projects.length === 0 || selectedProjectIds.length > 0) {
    return null;
  }

  if (projectKeyFromUrl) {
    const urlMatch = projects.find((project) => project.key === projectKeyFromUrl);
    if (urlMatch) {
      return {
        targetProject: urlMatch,
        shouldUpdateUrl: false,
      };
    }
  }

  const defaultProject = projects.find((project) => project.is_default);
  const targetProject = defaultProject ?? projects[0];
  if (!targetProject) {
    return null;
  }

  return {
    targetProject,
    shouldUpdateUrl: projectKeyFromUrl !== targetProject.key,
  };
}

