import type { ItemStatus } from "@/lib/planning/types";
import type {
  ActivityLogEntry,
  Agent,
  Backlog,
  Label,
  Project,
  StoryLabelLink,
  StoryStatusHistory,
  TaskLabel,
  TaskStatusHistory,
} from "@/lib/planning/entity-types";

export type SettingsProject = Pick<
  Project,
  "id" | "key" | "name" | "status" | "repo_root"
> & {
  is_default: number;
};

export type SettingsBacklog = Pick<
  Backlog,
  "id" | "project_id" | "name" | "kind" | "status" | "is_default" | "start_date" | "end_date"
>;

export type SettingsAgent = Pick<
  Agent,
  "id" | "openclaw_key" | "name" | "role" | "is_active"
>;

export type SettingsLabel = Pick<Label, "id" | "project_id" | "name" | "color">;

export type SettingsStoryLabel = Pick<StoryLabelLink, "story_id" | "label_id">;

export type SettingsTaskLabel = Pick<TaskLabel, "task_id" | "label_id">;

export type SettingsActivityLogEntry = Pick<
  ActivityLogEntry,
  | "id"
  | "project_id"
  | "entity_type"
  | "entity_id"
  | "actor_type"
  | "actor_id"
  | "event_name"
  | "message"
  | "created_at"
>;

export type SettingsStoryStatusHistory = Pick<
  StoryStatusHistory,
  "id" | "story_id" | "from_status" | "to_status" | "changed_by" | "changed_at"
>;

export type SettingsTaskStatusHistory = Pick<
  TaskStatusHistory,
  "id" | "task_id" | "from_status" | "to_status" | "changed_by" | "changed_at"
>;

export interface PlanningSettingsFixture {
  selected_project_id: string;
  projects: SettingsProject[];
  backlogs: SettingsBacklog[];
  story_statuses: ItemStatus[];
  task_statuses: ItemStatus[];
  agents: SettingsAgent[];
  labels: SettingsLabel[];
  story_labels: SettingsStoryLabel[];
  task_labels: SettingsTaskLabel[];
  activity_log: SettingsActivityLogEntry[];
  story_status_history: SettingsStoryStatusHistory[];
  task_status_history: SettingsTaskStatusHistory[];
}

export interface PlanningSettingsViewModel {
  project_defaults: {
    selected_project: SettingsProject | null;
    projects: SettingsProject[];
  };
  backlog_policy: {
    default_backlog: SettingsBacklog | null;
    backlogs: SettingsBacklog[];
    kinds: SettingsBacklog["kind"][];
    visibility_options: {
      active: boolean;
      closed: boolean;
    };
    sprint_lifecycle_policy: {
      start_semantics: string;
      complete_semantics: string;
    };
  };
  workflow: {
    story_statuses: ItemStatus[];
    task_statuses: ItemStatus[];
    blocked_behavior_cards: Array<{
      title: string;
      summary: string;
    }>;
  };
  assignment_defaults: {
    agents: SettingsAgent[];
    policy_cards: Array<{
      title: string;
      summary: string;
    }>;
  };
  label_taxonomy: {
    labels: Array<
      SettingsLabel & {
        story_count: number;
        task_count: number;
      }
    >;
  };
  audit_activity: {
    activity_log: SettingsActivityLogEntry[];
    story_status_history: SettingsStoryStatusHistory[];
    task_status_history: SettingsTaskStatusHistory[];
    retention_notes: string[];
  };
}
