/**
 * TypeScript types for the work-planning domain.
 *
 * Status enums and lightweight UI domain types live here.
 * Full entity interfaces (matching DB schema) live in ./entity-types.ts.
 */

// ─── Status Enums ─────────────────────────────────────────────────────

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

/** Lightweight work item detail used by the story/work-item detail dialog. */
export interface WorkItemDetail {
  id: string;
  project_id: string | null;
  parent_id: string | null;
  key: string | null;
  title: string;
  sub_type: string;
  summary: string | null;
  description: string | null;
  status: WorkItemStatus;
  priority: number | null;
  blocked_reason: string | null;
  labels: WorkItemLabel[];
  label_ids: string[];
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Lightweight task/child work item used in task list UI. */
export interface TaskItemView {
  id: string;
  key: string | null;
  title: string;
  summary: string | null;
  sub_type: string;
  status: WorkItemStatus;
  priority: number | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  estimate_points: number | null;
  due_at: string | null;
  current_assignee_agent_id: string | null;
}
