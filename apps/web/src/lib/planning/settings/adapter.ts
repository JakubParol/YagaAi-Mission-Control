import type { PlanningSettingsFixture, PlanningSettingsViewModel } from "./types.js";
import { planningSettingsFixture } from "./fixtures.js";

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
    {
      story_count: number;
      task_count: number;
    }
  >();

  for (const storyLabel of fixture.story_labels) {
    const usage = labelUsageById.get(storyLabel.label_id) ?? {
      story_count: 0,
      task_count: 0,
    };
    usage.story_count += 1;
    labelUsageById.set(storyLabel.label_id, usage);
  }

  for (const taskLabel of fixture.task_labels) {
    const usage = labelUsageById.get(taskLabel.label_id) ?? {
      story_count: 0,
      task_count: 0,
    };
    usage.task_count += 1;
    labelUsageById.set(taskLabel.label_id, usage);
  }

  return {
    project_defaults: {
      selected_project: selectedProject,
      projects: fixture.projects,
    },
    backlog_policy: {
      default_backlog:
        selectedProjectBacklogs.find((backlog) => backlog.is_default === 1) ?? null,
      backlogs: selectedProjectBacklogs,
      kinds: [...BACKLOG_KINDS_ORDER],
      visibility_options: {
        active: true,
        closed: true,
      },
      sprint_lifecycle_policy: {
        start_semantics: "Start only when no other ACTIVE sprint exists in project scope.",
        complete_semantics:
          "Complete sprint when all stories are DONE; otherwise show non-blocking preview warning.",
      },
    },
    workflow: {
      story_statuses: fixture.story_statuses,
      task_statuses: fixture.task_statuses,
      blocked_behavior_cards: [
        {
          title: "Task to Story propagation",
          summary: "If any child task has is_blocked=1, parent story is treated as blocked.",
        },
        {
          title: "Story to Epic propagation",
          summary: "If any child story has is_blocked=1, parent epic is treated as blocked.",
        },
      ],
    },
    assignment_defaults: {
      agents: fixture.agents,
      policy_cards: [
        {
          title: "Single active assignee",
          summary: "Only one active row in task_assignments per task (unassigned_at is NULL).",
        },
        {
          title: "Auto-close on DONE",
          summary: "Task DONE should close current assignment by setting unassigned_at.",
        },
        {
          title: "Manual handoff",
          summary: "Re-assignment is explicit and keeps task assignment history.",
        },
      ],
    },
    label_taxonomy: {
      labels: fixture.labels.map((label) => {
        const usage = labelUsageById.get(label.id) ?? {
          story_count: 0,
          task_count: 0,
        };

        return {
          ...label,
          story_count: usage.story_count,
          task_count: usage.task_count,
        };
      }),
    },
    audit_activity: {
      activity_log: fixture.activity_log,
      story_status_history: fixture.story_status_history,
      task_status_history: fixture.task_status_history,
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
