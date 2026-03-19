/**
 * Legacy adapter — delegates to the canonical useWorkItemWorkspaceState.
 *
 * All new code should import from work-item-workspace or work-item-workspace-state
 * directly. This file exists for backward compatibility during the transition.
 */

export {
  useWorkItemWorkspaceState as useStoryDetailState,
  type UseWorkItemWorkspaceParams as UseStoryDetailParams,
  type WorkspaceViewState,
} from "./work-item-workspace-state";
