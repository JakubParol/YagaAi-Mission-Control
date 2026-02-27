/**
 * TypeScript types for the v1 work-planning domain.
 *
 * Matches the DB columns defined in schema.ts / ENTITY_MODEL_V1.md.
 */

// ─── Status Enums ─────────────────────────────────────────────────────

/** Status values for stories and tasks. */
export type ItemStatus = "TODO" | "IN_PROGRESS" | "CODE_REVIEW" | "VERIFY" | "DONE";

/** Status values for epics. */
export type EpicStatus = "TODO" | "IN_PROGRESS" | "DONE";

/** Status values for projects. */
export type ProjectStatus = "ACTIVE" | "ARCHIVED";

/** Status values for backlogs. */
export type BacklogStatus = "ACTIVE" | "CLOSED";

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

// ─── Entity Interfaces ───────────────────────────────────────────────

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCounter {
  project_id: string;
  next_number: number;
  updated_at: string;
}

export interface Epic {
  id: string;
  project_id: string;
  key: string;
  title: string;
  description: string | null;
  status: EpicStatus;
  status_mode: StatusMode;
  status_override: string | null;
  status_override_set_at: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  priority: number | null;
  metadata_json: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Story {
  id: string;
  project_id: string | null;
  epic_id: string | null;
  key: string | null;
  title: string;
  intent: string | null;
  description: string | null;
  story_type: string;
  status: ItemStatus;
  status_mode: StatusMode;
  status_override: string | null;
  status_override_set_at: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  priority: number | null;
  metadata_json: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Task {
  id: string;
  project_id: string | null;
  story_id: string | null;
  key: string | null;
  title: string;
  objective: string | null;
  task_type: string;
  status: ItemStatus;
  is_blocked: number;
  blocked_reason: string | null;
  priority: number | null;
  estimate_points: number | null;
  due_at: string | null;
  current_assignee_agent_id: string | null;
  metadata_json: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Backlog {
  id: string;
  project_id: string | null;
  name: string;
  kind: BacklogKind;
  status: BacklogStatus;
  is_default: number;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata_json: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacklogStory {
  backlog_id: string;
  story_id: string;
  position: number;
  added_at: string;
}

export interface BacklogTask {
  backlog_id: string;
  task_id: string;
  position: number;
  added_at: string;
}

export interface Agent {
  id: string;
  openclaw_key: string;
  name: string;
  role: string | null;
  worker_type: string | null;
  is_active: number;
  source: AgentSource;
  metadata_json: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  agent_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  assigned_by: string | null;
  reason: string | null;
}

export interface Label {
  id: string;
  project_id: string | null;
  name: string;
  color: string | null;
  created_at: string;
}

export interface StoryLabel {
  story_id: string;
  label_id: string;
  added_at: string;
}

export interface TaskLabel {
  task_id: string;
  label_id: string;
  added_at: string;
}

export interface Comment {
  id: string;
  project_id: string | null;
  entity_type: EntityType;
  entity_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  edited_by: string | null;
  edited_at: string | null;
}

export interface Attachment {
  id: string;
  project_id: string | null;
  entity_type: EntityType;
  entity_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_url: string | null;
  file_path: string | null;
  metadata_json: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  project_id: string | null;
  entity_type: EntityType;
  entity_id: string;
  epic_id: string | null;
  story_id: string | null;
  task_id: string | null;
  backlog_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  session_id: string | null;
  run_id: string | null;
  event_name: string;
  message: string | null;
  event_data_json: string | null;
  created_at: string;
}

export interface EpicStatusHistory {
  id: string;
  project_id: string | null;
  epic_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

export interface StoryStatusHistory {
  id: string;
  project_id: string | null;
  story_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

export interface TaskStatusHistory {
  id: string;
  project_id: string | null;
  task_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}
