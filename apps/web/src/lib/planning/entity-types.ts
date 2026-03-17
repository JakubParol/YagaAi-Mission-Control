/**
 * Full entity interfaces matching the v2 DB schema.
 *
 * For lightweight UI types see ./types.ts.
 */

import type {
  ActorType,
  AgentSource,
  BacklogKind,
  BacklogStatus,
  EntityType,
  ProjectStatus,
  StatusMode,
  WorkItemStatus,
  WorkItemType,
} from "./types";

// ─── Entity Interfaces ───────────────────────────────────────────────

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  repo_root: string | null;
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

export interface WorkItem {
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
  status_override: string | null;
  status_override_set_at: string | null;
  is_blocked: boolean;
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
  rank: string;
  is_default: boolean;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata_json: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacklogItem {
  backlog_id: string;
  work_item_id: string;
  rank: string;
  added_at: string;
}

export interface Agent {
  id: string;
  openclaw_key: string;
  name: string;
  last_name: string | null;
  initials: string | null;
  role: string | null;
  worker_type: string | null;
  avatar: string | null;
  is_active: boolean;
  source: AgentSource;
  metadata_json: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkItemAssignment {
  id: string;
  work_item_id: string;
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

export interface WorkItemLabel {
  work_item_id: string;
  label_id: string;
  added_at: string;
}

// ─── Audit Types ─────────────────────────────────────────────────────

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
  entity_type: string;
  entity_id: string;
  work_item_id: string | null;
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

export interface WorkItemStatusHistory {
  id: string;
  project_id: string | null;
  work_item_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}
