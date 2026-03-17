/**
 * TypeScript types for the v1 work-planning domain.
 *
 * Status enums and lightweight UI domain types live here.
 * Full entity interfaces (matching DB schema) live in ./entity-types.ts.
 */

// ─── Status Enums ─────────────────────────────────────────────────────

/** Status values for stories and tasks. */
export type ItemStatus = "TODO" | "IN_PROGRESS" | "CODE_REVIEW" | "VERIFY" | "DONE";

/** Status values for epics. */
export type EpicStatus = "TODO" | "IN_PROGRESS" | "DONE";

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
export type EntityType = "project" | "backlog" | "epic" | "story" | "task";

// ─── UI Domain Types ────────────────────────────────────────────────

/** Label summary used across planning UI components. */
export interface StoryLabel {
  id: string;
  name: string;
  color: string | null;
}

/** Story with aggregated UI fields (labels, task count, boolean flags). */
export interface StoryDetail {
  id: string;
  project_id: string | null;
  epic_id: string | null;
  key: string | null;
  title: string;
  intent: string | null;
  description: string | null;
  story_type: string;
  status: ItemStatus;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  task_count: number;
  labels?: StoryLabel[];
  label_ids?: string[];
}

/** Task list item used in story detail views. */
export interface TaskItem {
  id: string;
  key: string | null;
  title: string;
  objective: string | null;
  task_type: string;
  status: ItemStatus;
  priority: number | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  estimate_points: number | null;
  due_at: string | null;
  current_assignee_agent_id: string | null;
}

// ─── V2 Types (for new /work-items API) ─────────────────────────────

/** Work item type discriminator (v2). */
export type WorkItemType = "EPIC" | "STORY" | "TASK" | "BUG";

/** Unified status for all work item types (v2). */
export type WorkItemStatus = ItemStatus;
