/**
 * Repository for all SQLite operations related to work-planning entities.
 *
 * Follows the same pattern as LangfuseRepository: synchronous better-sqlite3,
 * optional injected `db` defaulting to singleton `getDb()`.
 *
 * Canonical spec: docs/ENTITY_MODEL_V1.md + docs/WORKFLOW_LOGIC_V1.md
 */
import "server-only";

import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "../langfuse-import/db";
import type {
  Project,
  ProjectCounter,
  Epic,
  Story,
  Task,
  Backlog,
  Agent,
  TaskAssignment,
  Label,
  Comment,
  Attachment,
  ActivityLogEntry,
  EpicStatusHistory,
  StoryStatusHistory,
  TaskStatusHistory,
  EntityType,
  ActorType,
  ItemStatus,
  EpicStatus,
  ProjectStatus,
  BacklogStatus,
  BacklogKind,
  AgentSource,
  StatusMode,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

// ─── Input types (Partial / Create params) ────────────────────────────

export interface CreateProjectInput {
  key: string;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  created_by?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  updated_by?: string | null;
}

export interface CreateEpicInput {
  project_id: string;
  title: string;
  description?: string | null;
  status?: EpicStatus;
  status_mode?: StatusMode;
  priority?: number | null;
  metadata_json?: string | null;
  created_by?: string | null;
}

export interface UpdateEpicInput {
  title?: string;
  description?: string | null;
  status?: EpicStatus;
  status_mode?: StatusMode;
  status_override?: string | null;
  status_override_set_at?: string | null;
  is_blocked?: number;
  blocked_reason?: string | null;
  priority?: number | null;
  metadata_json?: string | null;
  updated_by?: string | null;
}

export interface CreateStoryInput {
  project_id?: string | null;
  epic_id?: string | null;
  title: string;
  intent?: string | null;
  description?: string | null;
  story_type: string;
  status?: ItemStatus;
  status_mode?: StatusMode;
  priority?: number | null;
  metadata_json?: string | null;
  created_by?: string | null;
}

export interface UpdateStoryInput {
  project_id?: string | null;
  epic_id?: string | null;
  title?: string;
  intent?: string | null;
  description?: string | null;
  story_type?: string;
  status?: ItemStatus;
  status_mode?: StatusMode;
  status_override?: string | null;
  status_override_set_at?: string | null;
  is_blocked?: number;
  blocked_reason?: string | null;
  priority?: number | null;
  metadata_json?: string | null;
  completed_at?: string | null;
  updated_by?: string | null;
}

export interface CreateTaskInput {
  project_id?: string | null;
  story_id?: string | null;
  title: string;
  objective?: string | null;
  task_type: string;
  status?: ItemStatus;
  priority?: number | null;
  estimate_points?: number | null;
  due_at?: string | null;
  current_assignee_agent_id?: string | null;
  metadata_json?: string | null;
  created_by?: string | null;
}

export interface UpdateTaskInput {
  project_id?: string | null;
  story_id?: string | null;
  title?: string;
  objective?: string | null;
  task_type?: string;
  status?: ItemStatus;
  is_blocked?: number;
  blocked_reason?: string | null;
  priority?: number | null;
  estimate_points?: number | null;
  due_at?: string | null;
  current_assignee_agent_id?: string | null;
  metadata_json?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_by?: string | null;
}

export interface CreateBacklogInput {
  project_id?: string | null;
  name: string;
  kind?: BacklogKind;
  status?: BacklogStatus;
  is_default?: number;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  metadata_json?: string | null;
  created_by?: string | null;
}

export interface UpdateBacklogInput {
  name?: string;
  kind?: BacklogKind;
  status?: BacklogStatus;
  is_default?: number;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  metadata_json?: string | null;
  updated_by?: string | null;
}

export interface CreateAgentInput {
  openclaw_key: string;
  name: string;
  role?: string | null;
  worker_type?: string | null;
  is_active?: number;
  source?: AgentSource;
  metadata_json?: string | null;
  last_synced_at?: string | null;
}

export interface UpdateAgentInput {
  name?: string;
  role?: string | null;
  worker_type?: string | null;
  is_active?: number;
  source?: AgentSource;
  metadata_json?: string | null;
  last_synced_at?: string | null;
}

export interface CreateCommentInput {
  project_id?: string | null;
  entity_type: EntityType;
  entity_id: string;
  body: string;
  created_by?: string | null;
}

export interface UpdateCommentInput {
  body: string;
  edited_by?: string | null;
}

export interface CreateAttachmentInput {
  project_id?: string | null;
  entity_type: EntityType;
  entity_id: string;
  filename: string;
  content_type?: string | null;
  size_bytes?: number | null;
  storage_url?: string | null;
  file_path?: string | null;
  metadata_json?: string | null;
  created_by?: string | null;
}

export interface AppendActivityLogInput {
  project_id?: string | null;
  entity_type: EntityType;
  entity_id: string;
  epic_id?: string | null;
  story_id?: string | null;
  task_id?: string | null;
  backlog_id?: string | null;
  actor_type: ActorType;
  actor_id?: string | null;
  session_id?: string | null;
  run_id?: string | null;
  event_name: string;
  message?: string | null;
  event_data_json?: string | null;
}

export interface AppendStatusHistoryInput {
  project_id?: string | null;
  from_status?: string | null;
  to_status: string;
  changed_by?: string | null;
  note?: string | null;
}

// ─── Repository ───────────────────────────────────────────────────────

export class PlanningRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDb();
  }

  // ─── Projects ─────────────────────────────────────────────────────

  createProject(input: CreateProjectInput): Project {
    const id = uuid();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO projects (id, key, name, description, status, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.key,
        input.name,
        input.description ?? null,
        input.status ?? "ACTIVE",
        input.created_by ?? null,
        input.created_by ?? null,
        ts,
        ts,
      );

    // Initialize project counter
    this.db
      .prepare(
        `INSERT INTO project_counters (project_id, next_number, updated_at)
         VALUES (?, 1, ?)`,
      )
      .run(id, ts);

    return this.getProjectById(id)!;
  }

  getProjectById(id: string): Project | null {
    return (
      (this.db
        .prepare(`SELECT * FROM projects WHERE id = ?`)
        .get(id) as Project | undefined) ?? null
    );
  }

  listProjects(): Project[] {
    return this.db
      .prepare(`SELECT * FROM projects ORDER BY created_at DESC`)
      .all() as Project[];
  }

  updateProject(id: string, input: UpdateProjectInput): Project | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.updated_by !== undefined) { fields.push("updated_by = ?"); values.push(input.updated_by); }

    if (fields.length === 0) return this.getProjectById(id);

    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);

    this.db
      .prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getProjectById(id);
  }

  deleteProject(id: string): void {
    this.db.prepare(`DELETE FROM project_counters WHERE project_id = ?`).run(id);
    this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  }

  // ─── Project Counters (internal) ─────────────────────────────────

  /** Atomically gets and increments the project counter. Returns the allocated number. */
  private allocateKey(projectId: string): number {
    const row = this.db
      .prepare(`SELECT next_number FROM project_counters WHERE project_id = ?`)
      .get(projectId) as ProjectCounter | undefined;

    const num = row?.next_number ?? 1;
    const ts = now();

    if (row) {
      this.db
        .prepare(
          `UPDATE project_counters SET next_number = ?, updated_at = ? WHERE project_id = ?`,
        )
        .run(num + 1, ts, projectId);
    } else {
      this.db
        .prepare(
          `INSERT INTO project_counters (project_id, next_number, updated_at) VALUES (?, ?, ?)`,
        )
        .run(projectId, num + 1, ts);
    }

    return num;
  }

  /** Build a human-readable key like "MC-42" from a project id. */
  private buildKey(projectId: string): string {
    const project = this.getProjectById(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const num = this.allocateKey(projectId);
    return `${project.key}-${num}`;
  }

  // ─── Epics ────────────────────────────────────────────────────────

  createEpic(input: CreateEpicInput): Epic {
    const id = uuid();
    const ts = now();
    const key = this.buildKey(input.project_id);

    this.db
      .prepare(
        `INSERT INTO epics (id, project_id, key, title, description, status, status_mode, status_override, status_override_set_at, is_blocked, blocked_reason, priority, metadata_json, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        key,
        input.title,
        input.description ?? null,
        input.status ?? "TODO",
        input.status_mode ?? "MANUAL",
        null,
        null,
        0,
        null,
        input.priority ?? null,
        input.metadata_json ?? null,
        input.created_by ?? null,
        input.created_by ?? null,
        ts,
        ts,
      );

    return this.getEpicById(id)!;
  }

  getEpicById(id: string): Epic | null {
    return (
      (this.db.prepare(`SELECT * FROM epics WHERE id = ?`).get(id) as
        | Epic
        | undefined) ?? null
    );
  }

  listEpicsByProject(projectId: string): Epic[] {
    return this.db
      .prepare(
        `SELECT * FROM epics WHERE project_id = ? ORDER BY priority ASC, created_at ASC`,
      )
      .all(projectId) as Epic[];
  }

  updateEpic(id: string, input: UpdateEpicInput): Epic | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.status_mode !== undefined) { fields.push("status_mode = ?"); values.push(input.status_mode); }
    if (input.status_override !== undefined) { fields.push("status_override = ?"); values.push(input.status_override); }
    if (input.status_override_set_at !== undefined) { fields.push("status_override_set_at = ?"); values.push(input.status_override_set_at); }
    if (input.is_blocked !== undefined) { fields.push("is_blocked = ?"); values.push(input.is_blocked); }
    if (input.blocked_reason !== undefined) { fields.push("blocked_reason = ?"); values.push(input.blocked_reason); }
    if (input.priority !== undefined) { fields.push("priority = ?"); values.push(input.priority); }
    if (input.metadata_json !== undefined) { fields.push("metadata_json = ?"); values.push(input.metadata_json); }
    if (input.updated_by !== undefined) { fields.push("updated_by = ?"); values.push(input.updated_by); }

    if (fields.length === 0) return this.getEpicById(id);

    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);

    this.db
      .prepare(`UPDATE epics SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getEpicById(id);
  }

  deleteEpic(id: string): void {
    this.db.prepare(`DELETE FROM epics WHERE id = ?`).run(id);
  }

  // ─── Stories ──────────────────────────────────────────────────────

  createStory(input: CreateStoryInput): Story {
    const id = uuid();
    const ts = now();
    const key = input.project_id ? this.buildKey(input.project_id) : null;

    this.db
      .prepare(
        `INSERT INTO stories (id, project_id, epic_id, key, title, intent, description, story_type, status, status_mode, status_override, status_override_set_at, is_blocked, blocked_reason, priority, metadata_json, created_by, updated_by, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.epic_id ?? null,
        key,
        input.title,
        input.intent ?? null,
        input.description ?? null,
        input.story_type,
        input.status ?? "TODO",
        input.status_mode ?? "MANUAL",
        null,
        null,
        0,
        null,
        input.priority ?? null,
        input.metadata_json ?? null,
        input.created_by ?? null,
        input.created_by ?? null,
        ts,
        ts,
        null,
      );

    return this.getStoryById(id)!;
  }

  getStoryById(id: string): Story | null {
    return (
      (this.db.prepare(`SELECT * FROM stories WHERE id = ?`).get(id) as
        | Story
        | undefined) ?? null
    );
  }

  listStoriesByProject(projectId: string): Story[] {
    return this.db
      .prepare(
        `SELECT * FROM stories WHERE project_id = ? ORDER BY priority ASC, created_at ASC`,
      )
      .all(projectId) as Story[];
  }

  listStoriesByEpic(epicId: string): Story[] {
    return this.db
      .prepare(
        `SELECT * FROM stories WHERE epic_id = ? ORDER BY priority ASC, created_at ASC`,
      )
      .all(epicId) as Story[];
  }

  updateStory(id: string, input: UpdateStoryInput): Story | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.project_id !== undefined) { fields.push("project_id = ?"); values.push(input.project_id); }
    if (input.epic_id !== undefined) { fields.push("epic_id = ?"); values.push(input.epic_id); }
    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.intent !== undefined) { fields.push("intent = ?"); values.push(input.intent); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.story_type !== undefined) { fields.push("story_type = ?"); values.push(input.story_type); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.status_mode !== undefined) { fields.push("status_mode = ?"); values.push(input.status_mode); }
    if (input.status_override !== undefined) { fields.push("status_override = ?"); values.push(input.status_override); }
    if (input.status_override_set_at !== undefined) { fields.push("status_override_set_at = ?"); values.push(input.status_override_set_at); }
    if (input.is_blocked !== undefined) { fields.push("is_blocked = ?"); values.push(input.is_blocked); }
    if (input.blocked_reason !== undefined) { fields.push("blocked_reason = ?"); values.push(input.blocked_reason); }
    if (input.priority !== undefined) { fields.push("priority = ?"); values.push(input.priority); }
    if (input.metadata_json !== undefined) { fields.push("metadata_json = ?"); values.push(input.metadata_json); }
    if (input.completed_at !== undefined) { fields.push("completed_at = ?"); values.push(input.completed_at); }
    if (input.updated_by !== undefined) { fields.push("updated_by = ?"); values.push(input.updated_by); }

    if (fields.length === 0) return this.getStoryById(id);

    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);

    this.db
      .prepare(`UPDATE stories SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getStoryById(id);
  }

  deleteStory(id: string): void {
    this.db.prepare(`DELETE FROM stories WHERE id = ?`).run(id);
  }

  // ─── Tasks ────────────────────────────────────────────────────────

  createTask(input: CreateTaskInput): Task {
    const id = uuid();
    const ts = now();
    const key = input.project_id ? this.buildKey(input.project_id) : null;

    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, story_id, key, title, objective, task_type, status, is_blocked, blocked_reason, priority, estimate_points, due_at, current_assignee_agent_id, metadata_json, created_by, updated_by, created_at, updated_at, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.story_id ?? null,
        key,
        input.title,
        input.objective ?? null,
        input.task_type,
        input.status ?? "TODO",
        0,
        null,
        input.priority ?? null,
        input.estimate_points ?? null,
        input.due_at ?? null,
        input.current_assignee_agent_id ?? null,
        input.metadata_json ?? null,
        input.created_by ?? null,
        input.created_by ?? null,
        ts,
        ts,
        null,
        null,
      );

    return this.getTaskById(id)!;
  }

  getTaskById(id: string): Task | null {
    return (
      (this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
        | Task
        | undefined) ?? null
    );
  }

  listTasksByStory(storyId: string): Task[] {
    return this.db
      .prepare(
        `SELECT * FROM tasks WHERE story_id = ? ORDER BY priority ASC, created_at ASC`,
      )
      .all(storyId) as Task[];
  }

  listTasksByProject(projectId: string): Task[] {
    return this.db
      .prepare(
        `SELECT * FROM tasks WHERE project_id = ? ORDER BY priority ASC, created_at ASC`,
      )
      .all(projectId) as Task[];
  }

  updateTask(id: string, input: UpdateTaskInput): Task | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.project_id !== undefined) { fields.push("project_id = ?"); values.push(input.project_id); }
    if (input.story_id !== undefined) { fields.push("story_id = ?"); values.push(input.story_id); }
    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.objective !== undefined) { fields.push("objective = ?"); values.push(input.objective); }
    if (input.task_type !== undefined) { fields.push("task_type = ?"); values.push(input.task_type); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.is_blocked !== undefined) { fields.push("is_blocked = ?"); values.push(input.is_blocked); }
    if (input.blocked_reason !== undefined) { fields.push("blocked_reason = ?"); values.push(input.blocked_reason); }
    if (input.priority !== undefined) { fields.push("priority = ?"); values.push(input.priority); }
    if (input.estimate_points !== undefined) { fields.push("estimate_points = ?"); values.push(input.estimate_points); }
    if (input.due_at !== undefined) { fields.push("due_at = ?"); values.push(input.due_at); }
    if (input.current_assignee_agent_id !== undefined) { fields.push("current_assignee_agent_id = ?"); values.push(input.current_assignee_agent_id); }
    if (input.metadata_json !== undefined) { fields.push("metadata_json = ?"); values.push(input.metadata_json); }
    if (input.started_at !== undefined) { fields.push("started_at = ?"); values.push(input.started_at); }
    if (input.completed_at !== undefined) { fields.push("completed_at = ?"); values.push(input.completed_at); }
    if (input.updated_by !== undefined) { fields.push("updated_by = ?"); values.push(input.updated_by); }

    if (fields.length === 0) return this.getTaskById(id);

    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);

    this.db
      .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getTaskById(id);
  }

  /** Convenience: update only the status of a task. */
  updateTaskStatus(id: string, status: ItemStatus, updatedBy?: string): Task | null {
    return this.updateTask(id, { status, updated_by: updatedBy });
  }

  deleteTask(id: string): void {
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  }

  // ─── Backlogs ─────────────────────────────────────────────────────

  createBacklog(input: CreateBacklogInput): Backlog {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO backlogs (id, project_id, name, kind, status, is_default, goal, start_date, end_date, metadata_json, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.name,
        input.kind ?? "BACKLOG",
        input.status ?? "ACTIVE",
        input.is_default ?? 0,
        input.goal ?? null,
        input.start_date ?? null,
        input.end_date ?? null,
        input.metadata_json ?? null,
        input.created_by ?? null,
        input.created_by ?? null,
        ts,
        ts,
      );

    return this.getBacklogById(id)!;
  }

  getBacklogById(id: string): Backlog | null {
    return (
      (this.db.prepare(`SELECT * FROM backlogs WHERE id = ?`).get(id) as
        | Backlog
        | undefined) ?? null
    );
  }

  listBacklogsByProject(projectId: string | null): Backlog[] {
    if (projectId === null) {
      return this.db
        .prepare(
          `SELECT * FROM backlogs WHERE project_id IS NULL ORDER BY created_at ASC`,
        )
        .all() as Backlog[];
    }
    return this.db
      .prepare(
        `SELECT * FROM backlogs WHERE project_id = ? ORDER BY created_at ASC`,
      )
      .all(projectId) as Backlog[];
  }

  addStoryToBacklog(backlogId: string, storyId: string, position: number): void {
    this.db
      .prepare(
        `INSERT INTO backlog_stories (backlog_id, story_id, position, added_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(backlogId, storyId, position, now());
  }

  removeStoryFromBacklog(backlogId: string, storyId: string): void {
    this.db
      .prepare(
        `DELETE FROM backlog_stories WHERE backlog_id = ? AND story_id = ?`,
      )
      .run(backlogId, storyId);
  }

  addTaskToBacklog(backlogId: string, taskId: string, position: number): void {
    this.db
      .prepare(
        `INSERT INTO backlog_tasks (backlog_id, task_id, position, added_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(backlogId, taskId, position, now());
  }

  removeTaskFromBacklog(backlogId: string, taskId: string): void {
    this.db
      .prepare(
        `DELETE FROM backlog_tasks WHERE backlog_id = ? AND task_id = ?`,
      )
      .run(backlogId, taskId);
  }

  // ─── Agents ───────────────────────────────────────────────────────

  createAgent(input: CreateAgentInput): Agent {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO agents (id, openclaw_key, name, role, worker_type, is_active, source, metadata_json, last_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.openclaw_key,
        input.name,
        input.role ?? null,
        input.worker_type ?? null,
        input.is_active ?? 1,
        input.source ?? "manual",
        input.metadata_json ?? null,
        input.last_synced_at ?? null,
        ts,
        ts,
      );

    return this.getAgentById(id)!;
  }

  getAgentById(id: string): Agent | null {
    return (
      (this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as
        | Agent
        | undefined) ?? null
    );
  }

  getAgentByKey(openclawKey: string): Agent | null {
    return (
      (this.db
        .prepare(`SELECT * FROM agents WHERE openclaw_key = ?`)
        .get(openclawKey) as Agent | undefined) ?? null
    );
  }

  listAgents(): Agent[] {
    return this.db
      .prepare(`SELECT * FROM agents ORDER BY name ASC`)
      .all() as Agent[];
  }

  updateAgent(id: string, input: UpdateAgentInput): Agent | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.role !== undefined) { fields.push("role = ?"); values.push(input.role); }
    if (input.worker_type !== undefined) { fields.push("worker_type = ?"); values.push(input.worker_type); }
    if (input.is_active !== undefined) { fields.push("is_active = ?"); values.push(input.is_active); }
    if (input.source !== undefined) { fields.push("source = ?"); values.push(input.source); }
    if (input.metadata_json !== undefined) { fields.push("metadata_json = ?"); values.push(input.metadata_json); }
    if (input.last_synced_at !== undefined) { fields.push("last_synced_at = ?"); values.push(input.last_synced_at); }

    if (fields.length === 0) return this.getAgentById(id);

    fields.push("updated_at = ?");
    values.push(now());
    values.push(id);

    this.db
      .prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getAgentById(id);
  }

  // ─── Task Assignments ─────────────────────────────────────────────

  assignTask(
    taskId: string,
    agentId: string,
    assignedBy?: string | null,
    reason?: string | null,
  ): TaskAssignment {
    const id = uuid();
    const ts = now();

    // Auto-unassign any currently active assignment
    this.db
      .prepare(
        `UPDATE task_assignments SET unassigned_at = ? WHERE task_id = ? AND unassigned_at IS NULL`,
      )
      .run(ts, taskId);

    this.db
      .prepare(
        `INSERT INTO task_assignments (id, task_id, agent_id, assigned_at, unassigned_at, assigned_by, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, taskId, agentId, ts, null, assignedBy ?? null, reason ?? null);

    // Also update current_assignee_agent_id on the task
    this.db
      .prepare(`UPDATE tasks SET current_assignee_agent_id = ?, updated_at = ? WHERE id = ?`)
      .run(agentId, ts, taskId);

    return this.db
      .prepare(`SELECT * FROM task_assignments WHERE id = ?`)
      .get(id) as TaskAssignment;
  }

  unassignTask(taskId: string, reason?: string | null): void {
    const ts = now();

    this.db
      .prepare(
        `UPDATE task_assignments SET unassigned_at = ?, reason = COALESCE(?, reason) WHERE task_id = ? AND unassigned_at IS NULL`,
      )
      .run(ts, reason ?? null, taskId);

    this.db
      .prepare(`UPDATE tasks SET current_assignee_agent_id = NULL, updated_at = ? WHERE id = ?`)
      .run(ts, taskId);
  }

  getActiveAssignmentByTask(taskId: string): TaskAssignment | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM task_assignments WHERE task_id = ? AND unassigned_at IS NULL`,
        )
        .get(taskId) as TaskAssignment | undefined) ?? null
    );
  }

  getAssignmentHistoryByTask(taskId: string): TaskAssignment[] {
    return this.db
      .prepare(
        `SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at DESC`,
      )
      .all(taskId) as TaskAssignment[];
  }

  // ─── Labels ───────────────────────────────────────────────────────

  createLabel(projectId: string | null, name: string, color?: string | null): Label {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO labels (id, project_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, name, color ?? null, ts);

    return this.db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Label;
  }

  listLabels(projectId?: string | null): Label[] {
    if (projectId === undefined) {
      return this.db
        .prepare(`SELECT * FROM labels ORDER BY name ASC`)
        .all() as Label[];
    }
    if (projectId === null) {
      return this.db
        .prepare(`SELECT * FROM labels WHERE project_id IS NULL ORDER BY name ASC`)
        .all() as Label[];
    }
    return this.db
      .prepare(
        `SELECT * FROM labels WHERE project_id = ? OR project_id IS NULL ORDER BY name ASC`,
      )
      .all(projectId) as Label[];
  }

  addLabelToStory(storyId: string, labelId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO story_labels (story_id, label_id, added_at) VALUES (?, ?, ?)`,
      )
      .run(storyId, labelId, now());
  }

  addLabelToTask(taskId: string, labelId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO task_labels (task_id, label_id, added_at) VALUES (?, ?, ?)`,
      )
      .run(taskId, labelId, now());
  }

  removeLabelFromStory(storyId: string, labelId: string): void {
    this.db
      .prepare(`DELETE FROM story_labels WHERE story_id = ? AND label_id = ?`)
      .run(storyId, labelId);
  }

  removeLabelFromTask(taskId: string, labelId: string): void {
    this.db
      .prepare(`DELETE FROM task_labels WHERE task_id = ? AND label_id = ?`)
      .run(taskId, labelId);
  }

  // ─── Comments ─────────────────────────────────────────────────────

  createComment(input: CreateCommentInput): Comment {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO comments (id, project_id, entity_type, entity_id, body, created_by, created_at, edited_by, edited_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.entity_type,
        input.entity_id,
        input.body,
        input.created_by ?? null,
        ts,
        null,
        null,
      );

    return this.getCommentById(id)!;
  }

  getCommentById(id: string): Comment | null {
    return (
      (this.db.prepare(`SELECT * FROM comments WHERE id = ?`).get(id) as
        | Comment
        | undefined) ?? null
    );
  }

  listCommentsByEntity(entityType: EntityType, entityId: string): Comment[] {
    return this.db
      .prepare(
        `SELECT * FROM comments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`,
      )
      .all(entityType, entityId) as Comment[];
  }

  updateComment(id: string, input: UpdateCommentInput): Comment | null {
    this.db
      .prepare(
        `UPDATE comments SET body = ?, edited_by = ?, edited_at = ? WHERE id = ?`,
      )
      .run(input.body, input.edited_by ?? null, now(), id);

    return this.getCommentById(id);
  }

  deleteComment(id: string): void {
    this.db.prepare(`DELETE FROM comments WHERE id = ?`).run(id);
  }

  // ─── Attachments ──────────────────────────────────────────────────

  createAttachment(input: CreateAttachmentInput): Attachment {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO attachments (id, project_id, entity_type, entity_id, filename, content_type, size_bytes, storage_url, file_path, metadata_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.entity_type,
        input.entity_id,
        input.filename,
        input.content_type ?? null,
        input.size_bytes ?? null,
        input.storage_url ?? null,
        input.file_path ?? null,
        input.metadata_json ?? null,
        input.created_by ?? null,
        ts,
      );

    return this.getAttachmentById(id)!;
  }

  getAttachmentById(id: string): Attachment | null {
    return (
      (this.db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(id) as
        | Attachment
        | undefined) ?? null
    );
  }

  listAttachmentsByEntity(entityType: EntityType, entityId: string): Attachment[] {
    return this.db
      .prepare(
        `SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`,
      )
      .all(entityType, entityId) as Attachment[];
  }

  deleteAttachment(id: string): void {
    this.db.prepare(`DELETE FROM attachments WHERE id = ?`).run(id);
  }

  // ─── Activity Log ─────────────────────────────────────────────────

  appendActivityLog(input: AppendActivityLogInput): ActivityLogEntry {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO activity_log (id, project_id, entity_type, entity_id, epic_id, story_id, task_id, backlog_id, actor_type, actor_id, session_id, run_id, event_name, message, event_data_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        input.entity_type,
        input.entity_id,
        input.epic_id ?? null,
        input.story_id ?? null,
        input.task_id ?? null,
        input.backlog_id ?? null,
        input.actor_type,
        input.actor_id ?? null,
        input.session_id ?? null,
        input.run_id ?? null,
        input.event_name,
        input.message ?? null,
        input.event_data_json ?? null,
        ts,
      );

    return this.db
      .prepare(`SELECT * FROM activity_log WHERE id = ?`)
      .get(id) as ActivityLogEntry;
  }

  listActivityByEntity(entityType: EntityType, entityId: string): ActivityLogEntry[] {
    return this.db
      .prepare(
        `SELECT * FROM activity_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
      )
      .all(entityType, entityId) as ActivityLogEntry[];
  }

  listActivityByProject(projectId: string): ActivityLogEntry[] {
    return this.db
      .prepare(
        `SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as ActivityLogEntry[];
  }

  // ─── Status History ───────────────────────────────────────────────

  appendEpicStatusHistory(epicId: string, input: AppendStatusHistoryInput): EpicStatusHistory {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO epic_status_history (id, project_id, epic_id, from_status, to_status, changed_by, changed_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        epicId,
        input.from_status ?? null,
        input.to_status,
        input.changed_by ?? null,
        ts,
        input.note ?? null,
      );

    return this.db
      .prepare(`SELECT * FROM epic_status_history WHERE id = ?`)
      .get(id) as EpicStatusHistory;
  }

  listEpicStatusHistory(epicId: string): EpicStatusHistory[] {
    return this.db
      .prepare(
        `SELECT * FROM epic_status_history WHERE epic_id = ? ORDER BY changed_at DESC`,
      )
      .all(epicId) as EpicStatusHistory[];
  }

  appendStoryStatusHistory(storyId: string, input: AppendStatusHistoryInput): StoryStatusHistory {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO story_status_history (id, project_id, story_id, from_status, to_status, changed_by, changed_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        storyId,
        input.from_status ?? null,
        input.to_status,
        input.changed_by ?? null,
        ts,
        input.note ?? null,
      );

    return this.db
      .prepare(`SELECT * FROM story_status_history WHERE id = ?`)
      .get(id) as StoryStatusHistory;
  }

  listStoryStatusHistory(storyId: string): StoryStatusHistory[] {
    return this.db
      .prepare(
        `SELECT * FROM story_status_history WHERE story_id = ? ORDER BY changed_at DESC`,
      )
      .all(storyId) as StoryStatusHistory[];
  }

  appendTaskStatusHistory(taskId: string, input: AppendStatusHistoryInput): TaskStatusHistory {
    const id = uuid();
    const ts = now();

    this.db
      .prepare(
        `INSERT INTO task_status_history (id, project_id, task_id, from_status, to_status, changed_by, changed_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id ?? null,
        taskId,
        input.from_status ?? null,
        input.to_status,
        input.changed_by ?? null,
        ts,
        input.note ?? null,
      );

    return this.db
      .prepare(`SELECT * FROM task_status_history WHERE id = ?`)
      .get(id) as TaskStatusHistory;
  }

  listTaskStatusHistory(taskId: string): TaskStatusHistory[] {
    return this.db
      .prepare(
        `SELECT * FROM task_status_history WHERE task_id = ? ORDER BY changed_at DESC`,
      )
      .all(taskId) as TaskStatusHistory[];
  }
}
