import { Command } from "commander";
import { ApiClient, ApiEnvelope, ApiListMeta } from "../client";
import { Story } from "../types";
import { printJson, printTable, formatStatus, truncate } from "../utils/formatters";

export function registerStoriesCommand(program: Command, client: ApiClient): void {
  const stories = program
    .command("stories")
    .description("Manage stories");

  stories
    .command("list")
    .description("List stories")
    .option("--project-id <id>", "Filter by project")
    .option("--epic-id <id>", "Filter by epic")
    .option("--status <status>", "Filter by status")
    .option("--story-type <type>", "Filter by type")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Offset", "0")
    .action(async (opts) => {
      const params: Record<string, unknown> = {
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      };
      if (opts.projectId) params.project_id = opts.projectId;
      if (opts.epicId) params.epic_id = opts.epicId;
      if (opts.status) params.status = opts.status;
      if (opts.storyType) params.story_type = opts.storyType;
      const resp = await client.get<ApiEnvelope<Story[]> & { meta: ApiListMeta }>(
        "/v1/planning/stories",
        params
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      printTable(
        ["ID", "Key", "Title", "Type", "Status", "Blocked"],
        resp.data.map((s) => [
          s.id.slice(0, 8),
          s.key ?? "(none)",
          truncate(s.title, 40),
          s.story_type,
          formatStatus(s.status),
          s.is_blocked ? "YES" : "",
        ])
      );
      console.log(`Total: ${resp.meta.total}`);
    });

  stories
    .command("get <id>")
    .description("Get story by ID")
    .action(async (id: string) => {
      const resp = await client.get<ApiEnvelope<Story>>(`/v1/planning/stories/${id}`);
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      const s = resp.data;
      printTable(
        ["Field", "Value"],
        [
          ["ID", s.id],
          ["Key", s.key ?? "(none)"],
          ["Title", s.title],
          ["Type", s.story_type],
          ["Status", formatStatus(s.status)],
          ["Status Mode", s.status_mode],
          ["Blocked", s.is_blocked ? `YES — ${s.blocked_reason ?? ""}` : "No"],
          ["Priority", s.priority?.toString() ?? ""],
          ["Project ID", s.project_id ?? "(global)"],
          ["Epic ID", s.epic_id ?? "(none)"],
          ["Intent", s.intent ?? ""],
          ["Description", s.description ?? ""],
          ["Created", s.created_at],
          ["Updated", s.updated_at],
        ]
      );
    });

  stories
    .command("create")
    .description("Create a new story")
    .requiredOption("--title <title>", "Story title")
    .requiredOption("--story-type <type>", "Story type (feature, bug, chore, spike)")
    .option("--project-id <id>", "Project ID")
    .option("--epic-id <id>", "Epic ID")
    .option("--description <desc>", "Description")
    .option("--intent <intent>", "Intent")
    .option("--priority <n>", "Priority")
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        title: opts.title,
        story_type: opts.storyType,
      };
      if (opts.projectId) body.project_id = opts.projectId;
      if (opts.epicId) body.epic_id = opts.epicId;
      if (opts.description) body.description = opts.description;
      if (opts.intent) body.intent = opts.intent;
      if (opts.priority) body.priority = parseInt(opts.priority);
      const resp = await client.post<ApiEnvelope<Story>>("/v1/planning/stories", body);
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      const key = resp.data.key ?? "(no key)";
      console.log(`Created story: ${key} — ${resp.data.title} (${resp.data.id})`);
    });

  stories
    .command("update <id>")
    .description("Update a story")
    .option("--title <title>", "New title")
    .option("--status <status>", "New status")
    .option("--story-type <type>", "New type")
    .option("--epic-id <id>", "New epic ID")
    .option("--project-id <id>", "New project ID")
    .option("--description <desc>", "New description")
    .option("--intent <intent>", "New intent")
    .option("--is-blocked <bool>", "Is blocked (true/false)")
    .option("--blocked-reason <reason>", "Blocked reason")
    .option("--priority <n>", "New priority")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.title) body.title = opts.title;
      if (opts.status) body.status = opts.status;
      if (opts.storyType) body.story_type = opts.storyType;
      if (opts.epicId) body.epic_id = opts.epicId;
      if (opts.projectId) body.project_id = opts.projectId;
      if (opts.description) body.description = opts.description;
      if (opts.intent) body.intent = opts.intent;
      if (opts.isBlocked !== undefined) body.is_blocked = opts.isBlocked === "true";
      if (opts.blockedReason) body.blocked_reason = opts.blockedReason;
      if (opts.priority) body.priority = parseInt(opts.priority);
      const resp = await client.patch<ApiEnvelope<Story>>(
        `/v1/planning/stories/${id}`,
        body
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      console.log(`Updated story: ${resp.data.key ?? "(no key)"} — ${resp.data.title}`);
    });

  stories
    .command("delete <id>")
    .description("Delete a story (cascades to tasks)")
    .action(async (id: string) => {
      await client.delete(`/v1/planning/stories/${id}`);
      console.log(`Deleted story ${id}`);
    });

  // Labels subcommands
  const labels = stories
    .command("labels")
    .description("Manage story labels");

  labels
    .command("add <story-id> <label-id>")
    .description("Attach a label to a story")
    .action(async (storyId: string, labelId: string) => {
      await client.post(`/v1/planning/stories/${storyId}/labels`, {
        label_id: labelId,
      });
      console.log(`Label ${labelId} attached to story ${storyId}`);
    });

  labels
    .command("remove <story-id> <label-id>")
    .description("Detach a label from a story")
    .action(async (storyId: string, labelId: string) => {
      await client.delete(`/v1/planning/stories/${storyId}/labels/${labelId}`);
      console.log(`Label ${labelId} detached from story ${storyId}`);
    });
}
