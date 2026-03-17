import type { PlanningSettingsFixture, PlanningSettingsViewModel } from "./types";
import { planningSettingsFixture } from "./fixtures";

const BACKLOG_KINDS_ORDER = ["BACKLOG", "SPRINT", "IDEAS"] as const;

export function buildPlanningSettingsViewModel(
  fixture: PlanningSettingsFixture,
): PlanningSettingsViewModel {
  const selectedProject =
    fixture.projects.find((project) => project.id === fixture.selected_project_id) ?? null;

  const selectedProjectBacklogs = fixture.backlogs.filter(
    (backlog) => backlog.project_id === fixture.selected_project_id,
  );

  const labelUsageById = new Map<
    string,
    { work_item_count: number }
  >();

  for (const workItemLabel of fixture.work_item_labels) {
    const usage = labelUsageById.get(workItemLabel.label_id) ?? {
      work_item_count: 0,
    };
    usage.work_item_count += 1;
    labelUsageById.set(workItemLabel.label_id, usage);
  }

  return {
    project_defaults: {
      selected_project: selectedProject,
      projects: fixture.projects,
    },
    backlog_policy: {
      default_backlog:
        selectedProjectBacklogs.find((backlog) => backlog.is_default) ?? null,
      backlogs: selectedProjectBacklogs,
      kinds: [...BACKLOG_KINDS_ORDER],
      visibility_options: {
        active: true,
        closed: true,
      },
      sprint_lifecycle_policy: {
        start_semantics: "Start only when no other ACTIVE sprint exists in project scope.",
        complete_semantics:
          "Complete sprint when all work items are DONE; otherwise show non-blocking preview warning.",
      },
    },
    workflow: {
      work_item_statuses: fixture.work_item_statuses,
      blocked_behavior_cards: [
        {
          title: "Child to parent propagation",
          summary: "If any child work item has is_blocked=true, parent work item is treated as blocked.",
        },
        {
          title: "Work item to epic propagation",
          summary: "If any child work item has is_blocked=true, parent epic is treated as blocked.",
        },
      ],
    },
    assignment_defaults: {
      agents: fixture.agents,
      policy_cards: [
        {
          title: "Single active assignee",
          summary: "Only one active row in work_item_assignments per work item (unassigned_at is NULL).",
        },
        {
          title: "Auto-close on DONE",
          summary: "Work item DONE should close current assignment by setting unassigned_at.",
        },
        {
          title: "Manual handoff",
          summary: "Re-assignment is explicit and keeps work item assignment history.",
        },
      ],
    },
    label_taxonomy: {
      labels: fixture.labels.map((label) => {
        const usage = labelUsageById.get(label.id) ?? {
          work_item_count: 0,
        };

        return {
          ...label,
          work_item_count: usage.work_item_count,
        };
      }),
    },
    audit_activity: {
      activity_log: fixture.activity_log,
      work_item_status_history: fixture.work_item_status_history,
      retention_notes: [
        "activity_log is append-only and keeps key planning events.",
        "Status history remains available for traceability after core entity deletion.",
      ],
    },
  };
}

export function getMockPlanningSettingsViewModel(): PlanningSettingsViewModel {
  return buildPlanningSettingsViewModel(planningSettingsFixture);
}
