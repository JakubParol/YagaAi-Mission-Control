import { Command } from "commander";
import { ApiClient, ApiEnvelope, ApiListMeta } from "../client";
import { Task } from "../types";
import { printJson, printTable, formatStatus, truncate } from "../utils/formatters";

export function registerTasksCommand(program: Command, client: ApiClient): void {
  const tasks = program
    .command("tasks")
    .description("Manage tasks");

  tasks
    .command("list")
    .description("List tasks")
    .option("--project-id <id>", "Filter by project")
    .option("--story-id <id>", "Filter by story")
    .option("--status <status>", "Filter by status")
    .option("--task-type <type>", "Filter by type")
    .option("--assignee <agent-id>", "Filter by assignee agent ID")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Offset", "0")
    .action(async (opts) => {
      const params: Record<string, unknown> = {
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      };
      if (opts.projectId) params.project_id = opts.projectId;
      if (opts.storyId) params.story_id = opts.storyId;
      if (opts.status) params.status = opts.status;
      if (opts.taskType) params.task_type = opts.taskType;
      if (opts.assignee) params.current_assignee_agent_id = opts.assignee;
      const resp = await client.get<ApiEnvelope<Task[]> & { meta: ApiListMeta }>(
        "/v1/planning/tasks",
        params
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      printTable(
        ["ID", "Key", "Title", "Type", "Status", "Blocked", "Priority"],
        resp.data.map((t) => [
          t.id.slice(0, 8),
          t.key ?? "(none)",
          truncate(t.title, 35),
          t.task_type,
          formatStatus(t.status),
          t.is_blocked ? "YES" : "",
          t.priority?.toString() ?? "",
        ])
      );
      console.log(`Total: ${resp.meta.total}`);
    });

  tasks
    .command("get <id>")
    .description("Get task by ID")
    .action(async (id: string) => {
      const resp = await client.get<ApiEnvelope<Task>>(`/v1/planning/tasks/${id}`);
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      const t = resp.data;
      printTable(
        ["Field", "Value"],
        [
          ["ID", t.id],
          ["Key", t.key ?? "(none)"],
          ["Title", t.title],
          ["Type", t.task_type],
          ["Status", formatStatus(t.status)],
          ["Blocked", t.is_blocked ? `YES — ${t.blocked_reason ?? ""}` : "No"],
          ["Priority", t.priority?.toString() ?? ""],
          ["Estimate", t.estimate_points?.toString() ?? ""],
          ["Due", t.due_at ?? ""],
          ["Project ID", t.project_id ?? "(global)"],
          ["Story ID", t.story_id ?? "(none)"],
          ["Objective", t.objective ?? ""],
          ["Started", t.started_at ?? ""],
          ["Completed", t.completed_at ?? ""],
          ["Created", t.created_at],
          ["Updated", t.updated_at],
        ]
      );
    });

  tasks
    .command("create")
    .description("Create a new task")
    .requiredOption("--title <title>", "Task title")
    .requiredOption("--task-type <type>", "Task type (coding, review, research, ops, other)")
    .option("--project-id <id>", "Project ID")
    .option("--story-id <id>", "Story ID")
    .option("--objective <text>", "Objective")
    .option("--priority <n>", "Priority")
    .option("--estimate <n>", "Estimate points")
    .option("--due-at <date>", "Due date (ISO 8601)")
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        title: opts.title,
        task_type: opts.taskType,
      };
      if (opts.projectId) body.project_id = opts.projectId;
      if (opts.storyId) body.story_id = opts.storyId;
      if (opts.objective) body.objective = opts.objective;
      if (opts.priority) body.priority = parseInt(opts.priority);
      if (opts.estimate) body.estimate_points = parseFloat(opts.estimate);
      if (opts.dueAt) body.due_at = opts.dueAt;
      const resp = await client.post<ApiEnvelope<Task>>("/v1/planning/tasks", body);
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      const key = resp.data.key ?? "(no key)";
      console.log(`Created task: ${key} — ${resp.data.title} (${resp.data.id})`);
    });

  tasks
    .command("update <id>")
    .description("Update a task")
    .option("--title <title>", "New title")
    .option("--status <status>", "New status")
    .option("--task-type <type>", "New type")
    .option("--story-id <id>", "New story ID")
    .option("--project-id <id>", "New project ID")
    .option("--objective <text>", "New objective")
    .option("--priority <n>", "New priority")
    .option("--estimate <n>", "New estimate points")
    .option("--due-at <date>", "New due date")
    .option("--is-blocked <bool>", "Is blocked (true/false)")
    .option("--blocked-reason <reason>", "Blocked reason")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.title) body.title = opts.title;
      if (opts.status) body.status = opts.status;
      if (opts.taskType) body.task_type = opts.taskType;
      if (opts.storyId) body.story_id = opts.storyId;
      if (opts.projectId) body.project_id = opts.projectId;
      if (opts.objective) body.objective = opts.objective;
      if (opts.priority) body.priority = parseInt(opts.priority);
      if (opts.estimate) body.estimate_points = parseFloat(opts.estimate);
      if (opts.dueAt) body.due_at = opts.dueAt;
      if (opts.isBlocked !== undefined) body.is_blocked = opts.isBlocked === "true";
      if (opts.blockedReason) body.blocked_reason = opts.blockedReason;
      const resp = await client.patch<ApiEnvelope<Task>>(
        `/v1/planning/tasks/${id}`,
        body
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      console.log(`Updated task: ${resp.data.key ?? "(no key)"} — ${resp.data.title}`);
    });

  tasks
    .command("delete <id>")
    .description("Delete a task")
    .action(async (id: string) => {
      await client.delete(`/v1/planning/tasks/${id}`);
      console.log(`Deleted task ${id}`);
    });

  // Assignment subcommands
  tasks
    .command("assign <task-id> <agent-id>")
    .description("Assign an agent to a task")
    .option("--reason <reason>", "Assignment reason")
    .action(async (taskId: string, agentId: string, opts) => {
      const body: Record<string, unknown> = { agent_id: agentId };
      if (opts.reason) body.reason = opts.reason;
      await client.post(`/v1/planning/tasks/${taskId}/assignments`, body);
      console.log(`Agent ${agentId} assigned to task ${taskId}`);
    });

  tasks
    .command("unassign <task-id>")
    .description("Unassign current agent from a task")
    .action(async (taskId: string) => {
      await client.delete(`/v1/planning/tasks/${taskId}/assignments/current`);
      console.log(`Unassigned current agent from task ${taskId}`);
    });

  // Labels subcommands
  const labels = tasks
    .command("labels")
    .description("Manage task labels");

  labels
    .command("add <task-id> <label-id>")
    .description("Attach a label to a task")
    .action(async (taskId: string, labelId: string) => {
      await client.post(`/v1/planning/tasks/${taskId}/labels`, {
        label_id: labelId,
      });
      console.log(`Label ${labelId} attached to task ${taskId}`);
    });

  labels
    .command("remove <task-id> <label-id>")
    .description("Detach a label from a task")
    .action(async (taskId: string, labelId: string) => {
      await client.delete(`/v1/planning/tasks/${taskId}/labels/${labelId}`);
      console.log(`Label ${labelId} detached from task ${taskId}`);
    });
}
