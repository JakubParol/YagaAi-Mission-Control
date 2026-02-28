import { Command } from "commander";
import { ApiClient, ApiEnvelope, ApiListMeta } from "../client";
import { Project } from "../types";
import { printJson, printTable, formatStatus, truncate } from "../utils/formatters";

export function registerProjectsCommand(program: Command, client: ApiClient): void {
  const projects = program
    .command("projects")
    .description("Manage projects");

  projects
    .command("list")
    .description("List all projects")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Offset", "0")
    .option("--status <status>", "Filter by status")
    .action(async (opts) => {
      const params: Record<string, unknown> = {
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      };
      if (opts.status) params.status = opts.status;
      const resp = await client.get<ApiEnvelope<Project[]> & { meta: ApiListMeta }>(
        "/v1/planning/projects",
        params
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      printTable(
        ["ID", "Key", "Name", "Status", "Description"],
        resp.data.map((p) => [
          p.id.slice(0, 8),
          p.key,
          p.name,
          formatStatus(p.status),
          truncate(p.description, 40),
        ])
      );
      console.log(`Total: ${resp.meta.total}`);
    });

  projects
    .command("get <id>")
    .description("Get project by ID")
    .action(async (id: string) => {
      const resp = await client.get<ApiEnvelope<Project>>(`/v1/planning/projects/${id}`);
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      const p = resp.data;
      printTable(
        ["Field", "Value"],
        [
          ["ID", p.id],
          ["Key", p.key],
          ["Name", p.name],
          ["Status", formatStatus(p.status)],
          ["Description", p.description ?? ""],
          ["Repo Root", p.repo_root ?? ""],
          ["Created", p.created_at],
          ["Updated", p.updated_at],
        ]
      );
    });

  projects
    .command("create")
    .description("Create a new project")
    .requiredOption("--key <key>", "Project key (e.g. MC)")
    .requiredOption("--name <name>", "Project name")
    .option("--description <desc>", "Project description")
    .option("--repo-root <path>", "Path to local repo root")
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        key: opts.key,
        name: opts.name,
      };
      if (opts.description) body.description = opts.description;
      if (opts.repoRoot) body.repo_root = opts.repoRoot;
      const resp = await client.post<ApiEnvelope<Project>>("/v1/planning/projects", body);
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      console.log(`Created project: ${resp.data.key} — ${resp.data.name} (${resp.data.id})`);
    });

  projects
    .command("update <id>")
    .description("Update a project")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--status <status>", "New status (ACTIVE/ARCHIVED)")
    .option("--repo-root <path>", "New repo root path")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.status) body.status = opts.status;
      if (opts.repoRoot) body.repo_root = opts.repoRoot;
      const resp = await client.patch<ApiEnvelope<Project>>(
        `/v1/planning/projects/${id}`,
        body
      );
      if (program.opts().json) {
        printJson(resp);
        return;
      }
      console.log(`Updated project: ${resp.data.key} — ${resp.data.name}`);
    });

  projects
    .command("delete <id>")
    .description("Delete a project (cascades)")
    .action(async (id: string) => {
      await client.delete(`/v1/planning/projects/${id}`);
      console.log(`Deleted project ${id}`);
    });
}
