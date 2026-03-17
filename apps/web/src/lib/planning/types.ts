/**
 * TypeScript types for the v2 work-planning domain.
 *
 * Status enums and lightweight UI domain types live here.
 * Full entity interfaces (matching DB schema) live in ./entity-types.ts.
 */

// ─── Enums ───────────────────────────────────────────────────────────

/** Work item type discriminator. */
export type WorkItemType = "EPIC" | "STORY" | "TASK" | "BUG";

/** Unified status for all work item types. */
export type WorkItemStatus = "TODO" | "IN_PROGRESS" | "CODE_REVIEW" | "VERIFY" | "DONE";

/** Status values for projects. */
export type ProjectStatus = "ACTIVE" | "ARCHIVED";

/** Status values for backlogs. */
export type BacklogStatus = "OPEN" | "ACTIVE" | "CLOSED";

/** Backlog kind values. */
export type BacklogKind = "BACKLOG" | "SPRINT" | "IDEAS";

/** How the entity status is determined. */
export type StatusMode = "MANUAL" | "DERIVED";

/** Agent data source. */
export type AgentSource = "openclaw_json" | "manual";

/** Actor types for activity log. */
export type ActorType = "human" | "agent" | "system";

/** Entity types that support comments, attachments, and activity log. */
export type EntityType = "project" | "backlog" | "work_item";

// ─── UI Domain Types ────────────────────────────────────────────────

/** Label summary used across planning UI components. */
export interface WorkItemLabel {
  id: string;
  name: string;
  color: string | null;
}

/** Work item with aggregated UI fields. */
export interface WorkItemDetail {
  id: string;
  type: WorkItemType;
  project_id: string | null;
  parent_id: string | null;
  key: string | null;
  title: string;
  sub_type: string | null;
  summary: string | null;
  description: string | null;
  status: WorkItemStatus;
  status_mode: StatusMode;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  estimate_points: number | null;
  due_at: string | null;
  current_assignee_agent_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  children_count: number;
  labels?: WorkItemLabel[];
  label_ids?: string[];
}

// ─── Legacy aliases (for incremental migration of UI components) ────

/** @deprecated Use WorkItemStatus */
export type ItemStatus = WorkItemStatus;
/** @deprecated Use WorkItemStatus */
export type EpicStatus = WorkItemStatus;
/** @deprecated Use WorkItemLabel */
export type StoryLabel = WorkItemLabel;
