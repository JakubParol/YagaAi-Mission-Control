import { Command } from "commander";
import { ApiClient, ApiEnvelope, ApiListMeta } from "../client";
import { Epic } from "../types";
import { printJson, printTable, formatStatus, truncate } from "../utils/formatters";

export function registerEpicsCommand(program: Command, client: ApiClient): void {
  const epics = program
    .command("epics")
    .description("Manage epics");

  epics
    .command("list")
    .description("List epics for a project")
    .requiredOption("--project-id <id>", "Project ID")
    .option("--status <status>", "Filter by status")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Offset", "0")
    .action(async (opts) => {
      const params: Record<string, unknown> = {
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      };
      if (opts.status) params.status = opts.status;
      const resp = await client.get<ApiEnvelope<Epic[]> & { meta: ApiListMeta }>(
        `/v1/planning/projects/${opts.projectId}/epics`,
        params
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      printTable(
        ["ID", "Key", "Title", "Status", "Blocked", "Priority"],
        resp.data.map((e) => [
          e.id.slice(0, 8),
          e.key,
          truncate(e.title, 40),
          formatStatus(e.status),
          e.is_blocked ? "YES" : "",
          e.priority?.toString() ?? "",
        ])
      );
      console.log(`Total: ${resp.meta.total}`);
    });

  epics
    .command("get <id>")
    .description("Get epic by ID")
    .requiredOption("--project-id <id>", "Project ID")
    .action(async (id: string, opts) => {
      const resp = await client.get<ApiEnvelope<Epic>>(
        `/v1/planning/projects/${opts.projectId}/epics/${id}`
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      const e = resp.data;
      printTable(
        ["Field", "Value"],
        [
          ["ID", e.id],
          ["Key", e.key],
          ["Title", e.title],
          ["Status", formatStatus(e.status)],
          ["Status Mode", e.status_mode],
          ["Blocked", e.is_blocked ? `YES — ${e.blocked_reason ?? ""}` : "No"],
          ["Priority", e.priority?.toString() ?? ""],
          ["Description", e.description ?? ""],
          ["Created", e.created_at],
          ["Updated", e.updated_at],
        ]
      );
    });

  epics
    .command("create")
    .description("Create a new epic")
    .requiredOption("--project-id <id>", "Project ID")
    .requiredOption("--title <title>", "Epic title")
    .option("--description <desc>", "Description")
    .option("--priority <n>", "Priority")
    .action(async (opts) => {
      const body: Record<string, unknown> = { title: opts.title };
      if (opts.description) body.description = opts.description;
      if (opts.priority) body.priority = parseInt(opts.priority);
      const resp = await client.post<ApiEnvelope<Epic>>(
        `/v1/planning/projects/${opts.projectId}/epics`,
        body
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      console.log(`Created epic: ${resp.data.key} — ${resp.data.title} (${resp.data.id})`);
    });

  epics
    .command("update <id>")
    .description("Update an epic")
    .requiredOption("--project-id <id>", "Project ID")
    .option("--title <title>", "New title")
    .option("--description <desc>", "New description")
    .option("--status <status>", "New status")
    .option("--is-blocked <bool>", "Is blocked (true/false)")
    .option("--blocked-reason <reason>", "Blocked reason")
    .option("--priority <n>", "New priority")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.title) body.title = opts.title;
      if (opts.description) body.description = opts.description;
      if (opts.status) body.status = opts.status;
      if (opts.isBlocked !== undefined) body.is_blocked = opts.isBlocked === "true";
      if (opts.blockedReason) body.blocked_reason = opts.blockedReason;
      if (opts.priority) body.priority = parseInt(opts.priority);
      const resp = await client.patch<ApiEnvelope<Epic>>(
        `/v1/planning/projects/${opts.projectId}/epics/${id}`,
        body
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      console.log(`Updated epic: ${resp.data.key} — ${resp.data.title}`);
    });

  epics
    .command("delete <id>")
    .description("Delete an epic")
    .requiredOption("--project-id <id>", "Project ID")
    .action(async (id: string, opts) => {
      await client.delete(`/v1/planning/projects/${opts.projectId}/epics/${id}`);
      console.log(`Deleted epic ${id}`);
    });
}
