import type { WorkItemStatus } from "@/lib/planning/types";
import type {
  ActivityLogEntry,
  Agent,
  Backlog,
  Label,
  Project,
  WorkItemLabelLink,
  WorkItemStatusHistory,
} from "@/lib/planning/entity-types";

export type SettingsProject = Pick<
  Project,
  "id" | "key" | "name" | "status" | "repo_root"
> & {
  is_default: boolean;
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

export type SettingsWorkItemLabel = Pick<WorkItemLabelLink, "work_item_id" | "label_id">;

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

export type SettingsWorkItemStatusHistory = Pick<
  WorkItemStatusHistory,
  "id" | "work_item_id" | "from_status" | "to_status" | "changed_by" | "changed_at"
>;

export interface PlanningSettingsFixture {
  selected_project_id: string;
  projects: SettingsProject[];
  backlogs: SettingsBacklog[];
  work_item_statuses: WorkItemStatus[];
  agents: SettingsAgent[];
  labels: SettingsLabel[];
  work_item_labels: SettingsWorkItemLabel[];
  activity_log: SettingsActivityLogEntry[];
  work_item_status_history: SettingsWorkItemStatusHistory[];
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
    work_item_statuses: WorkItemStatus[];
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
        work_item_count: number;
      }
    >;
  };
  audit_activity: {
    activity_log: SettingsActivityLogEntry[];
    work_item_status_history: SettingsWorkItemStatusHistory[];
    retention_notes: string[];
  };
}
