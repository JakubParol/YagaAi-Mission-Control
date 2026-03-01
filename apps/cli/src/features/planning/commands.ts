import { Command } from "commander";

import { CliUsageError } from "../../core/errors";
import { unwrapEnvelope } from "../../core/envelope";
import type { ApiClient } from "../../core/http";
import { collectOption, parseIntegerOption, parseKeyValueList } from "../../core/kv";
import { buildPayload } from "../../core/payload";
import { printPayload } from "../../core/output";
import type { ContextFactory } from "../../core/runtime";
import {
  PLANNING_RESOURCES,
  type PathContext,
  type PlanningResourceName,
  type PlanningResourceSpec,
} from "./resources";

interface CommonFilterOptions {
  filter?: string[];
  projectId?: string;
  projectKey?: string;
  epicId?: string;
  epicKey?: string;
  storyId?: string;
  storyKey?: string;
  status?: string;
  kind?: string;
  source?: string;
  isActive?: string;
  isBlocked?: string;
  taskType?: string;
  storyType?: string;
  currentAssigneeAgentId?: string;
  key?: string;
  name?: string;
  title?: string;
  openclawKey?: string;
}

interface ListOptions extends CommonFilterOptions {
  sort?: string;
  limit?: number;
  offset?: number;
}

interface SelectorOptions extends CommonFilterOptions {
  id?: string;
  by?: string[];
}

interface MutationOptions extends SelectorOptions {
  json?: string;
  file?: string;
  set?: string[];
}

interface DeleteOptions extends SelectorOptions {
  yes?: boolean;
}

interface CreateOptions {
  json?: string;
  file?: string;
  set?: string[];
  projectId?: string;
}

interface TaskAssignOptions extends SelectorOptions {
  agentId: string;
  reason?: string;
}

type TaskUnassignOptions = SelectorOptions;

type TaskAssignmentsOptions = SelectorOptions;

function addSelectConvenienceOptions(command: Command): Command {
  return command
    .option("--project-id <id>", "filter by project UUID")
    .option("--project-key <key>", "filter by project key (e.g. MC)")
    .option("--epic-id <id>", "filter by epic UUID")
    .option("--epic-key <key>", "filter by epic key (e.g. MC-1)")
    .option("--story-id <id>", "filter by story UUID")
    .option("--story-key <key>", "filter by story key (e.g. MC-42)")
    .option("--status <status>", "status filter")
    .option("--kind <kind>", "kind filter")
    .option("--source <source>", "source filter")
    .option("--is-active <true|false>", "is_active filter")
    .option("--is-blocked <true|false>", "is_blocked filter")
    .option("--task-type <type>", "task_type filter")
    .option("--story-type <type>", "story_type filter")
    .option("--current-assignee-agent-id <id>", "current_assignee_agent_id filter")
    .option("--key <key>", "key filter")
    .option("--name <name>", "name filter")
    .option("--title <title>", "title filter")
    .option("--openclaw-key <key>", "openclaw_key filter");
}

function addPayloadOptions(command: Command): Command {
  return command
    .option("--json <json>", "JSON object payload")
    .option("--file <path>", "path to JSON payload file")
    .option(
      "--set <field=value>",
      "payload field override (repeatable)",
      collectOption,
      [],
    );
}

function mergeQuery(
  target: Record<string, string | number>,
  input: Record<string, string | number>,
): Record<string, string | number> {
  for (const [key, value] of Object.entries(input)) {
    if (target[key] !== undefined && target[key] !== value) {
      throw new CliUsageError(
        `Conflicting values for '${key}': '${target[key]}' and '${value}'.`,
      );
    }
    target[key] = value;
  }
  return target;
}

function validateMutuallyExclusive(
  idValue: string | undefined,
  keyValue: string | undefined,
  idFlag: string,
  keyFlag: string,
): void {
  if (idValue !== undefined && keyValue !== undefined) {
    throw new CliUsageError(`${idFlag} and ${keyFlag} are mutually exclusive.`);
  }
}

function buildConvenienceQuery(opts: CommonFilterOptions): Record<string, string> {
  validateMutuallyExclusive(opts.projectId, opts.projectKey, "--project-id", "--project-key");
  validateMutuallyExclusive(opts.epicId, opts.epicKey, "--epic-id", "--epic-key");
  validateMutuallyExclusive(opts.storyId, opts.storyKey, "--story-id", "--story-key");

  const query: Record<string, string> = {};

  const assign = (key: string, value: string | undefined): void => {
    if (value === undefined || value === "") return;
    const prev = query[key];
    if (prev !== undefined && prev !== value) {
      throw new CliUsageError(`Conflicting values for '${key}': '${prev}' and '${value}'.`);
    }
    query[key] = value;
  };

  assign("project_id", opts.projectId);
  assign("project_key", opts.projectKey);
  assign("epic_id", opts.epicId);
  assign("epic_key", opts.epicKey);
  assign("story_id", opts.storyId);
  assign("story_key", opts.storyKey);
  assign("status", opts.status);
  assign("kind", opts.kind);
  assign("source", opts.source);
  assign("is_active", opts.isActive);
  assign("is_blocked", opts.isBlocked);
  assign("task_type", opts.taskType);
  assign("story_type", opts.storyType);
  assign("current_assignee_agent_id", opts.currentAssigneeAgentId);
  assign("key", opts.key);
  assign("name", opts.name);
  assign("title", opts.title);
  assign("openclaw_key", opts.openclawKey);

  return query;
}

function resolvePathContext(
  spec: PlanningResourceSpec,
  query: Record<string, string | number>,
  explicitProjectId?: string,
): PathContext {
  const projectIdFromQuery =
    typeof query.project_id === "string" ? query.project_id : undefined;
  const projectId = explicitProjectId ?? projectIdFromQuery;

  if (spec.requiredContext.includes("projectId") && !projectId) {
    throw new CliUsageError(
      `${spec.name} command requires --project-id or --project-key because API path is nested by project.`,
    );
  }

  if (spec.requiredContext.includes("projectId")) {
    delete query.project_id;
  }

  return { projectId };
}

function buildListQuery(spec: PlanningResourceSpec, opts: ListOptions): {
  query: Record<string, string | number>;
  ctx: PathContext;
} {
  const query = mergeQuery({}, parseKeyValueList(opts.filter));
  mergeQuery(query, buildConvenienceQuery(opts));

  if (opts.sort) {
    query.sort = opts.sort;
  } else if (spec.defaultSort) {
    query.sort = spec.defaultSort;
  }

  if (opts.limit !== undefined) {
    query.limit = opts.limit;
  }

  if (opts.offset !== undefined) {
    query.offset = opts.offset;
  }

  const ctx = resolvePathContext(spec, query, opts.projectId);
  return { query, ctx };
}

function buildSelectorQuery(spec: PlanningResourceSpec, opts: SelectorOptions): {
  selectors: Record<string, string>;
  ctx: PathContext;
} {
  const merged = mergeQuery({}, parseKeyValueList(opts.by));
  mergeQuery(merged, buildConvenienceQuery(opts));
  const selectors: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    selectors[key] = String(value);
  }

  const ctx = resolvePathContext(spec, selectors, opts.projectId);
  return { selectors, ctx };
}

function ensureSingleMatch(resourceName: string, payload: unknown): string {
  const { data } = unwrapEnvelope(payload);
  if (!Array.isArray(data)) {
    throw new CliUsageError(
      `Cannot resolve ${resourceName} selector because list response is not an array.`,
    );
  }

  if (data.length === 0) {
    throw new CliUsageError(`${resourceName} not found for provided selector.`);
  }

  if (data.length > 1) {
    const ids = data
      .map((row) => (row && typeof row === "object" && "id" in row ? (row as { id?: unknown }).id : null))
      .filter((id): id is string => typeof id === "string");

    const suffix = ids.length > 0 ? ` Matching ids: ${ids.join(", ")}` : "";
    throw new CliUsageError(
      `Selector for ${resourceName} is ambiguous (${data.length} results). Add more --by filters.${suffix}`,
    );
  }

  const row = data[0];
  if (!row || typeof row !== "object" || !("id" in row)) {
    throw new CliUsageError(`Cannot resolve ${resourceName} id from list response.`);
  }

  const id = (row as { id?: unknown }).id;
  if (typeof id !== "string" || !id) {
    throw new CliUsageError(`Cannot resolve ${resourceName} id from selector result.`);
  }

  return id;
}

async function resolveTargetId(
  spec: PlanningResourceSpec,
  opts: SelectorOptions,
  client: ApiClient,
): Promise<{ id: string; ctx: PathContext }> {
  if (opts.id) {
    const quickCtx = resolvePathContext(spec, {}, opts.projectId);
    return { id: opts.id, ctx: quickCtx };
  }

  const { selectors, ctx } = buildSelectorQuery(spec, opts);
  if (Object.keys(selectors).length === 0) {
    throw new CliUsageError("Provide --id or at least one selector via --by field=value.");
  }

  const listPath = spec.listPath(ctx);
  const payload = await client.get(listPath, {
    query: {
      ...selectors,
      limit: 2,
      offset: 0,
    },
  });

  const id = ensureSingleMatch(spec.name, payload);
  return { id, ctx };
}

function registerStandardResourceCommands(
  resource: Command,
  spec: PlanningResourceSpec,
  getContext: ContextFactory,
): void {
  addSelectConvenienceOptions(
    resource
      .command("list")
      .description(`List ${spec.name} records with optional multi-field filters`)
      .option("--filter <field=value>", "query filter (repeatable)", collectOption, [])
      .option("--sort <sort>", "sort spec, e.g. priority,-updated_at")
      .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
      .option("--offset <n>", "offset", (raw) => parseIntegerOption(raw, "offset")),
  ).action(async (opts: ListOptions, command: Command) => {
    const ctx = getContext(command);
    const { query, ctx: pathCtx } = buildListQuery(spec, opts);
    const payload = await ctx.client.get(spec.listPath(pathCtx), { query });
    printPayload(payload, ctx.config.output);
  });

  addSelectConvenienceOptions(
    resource
      .command("get")
      .description(`Get a single ${spec.name} by --id or selector fields`)
      .option("--id <id>", "resource UUID")
      .option("--by <field=value>", "selector filter (repeatable)", collectOption, []),
  ).action(async (opts: SelectorOptions, command: Command) => {
    const ctx = getContext(command);
    const target = await resolveTargetId(spec, opts, ctx.client);
    const payload = await ctx.client.get(spec.itemPath(target.id, target.ctx));
    printPayload(payload, ctx.config.output);
  });

  addPayloadOptions(
    resource
      .command("create")
      .description(`Create ${spec.name}; payload from --json/--file/--set`)
      .option("--project-id <id>", "project context for nested resources (required for epic)"),
  ).action(async (opts: CreateOptions, command: Command) => {
    const ctx = getContext(command);
    const payloadBody = buildPayload({
      json: opts.json,
      file: opts.file,
      sets: opts.set,
    });

    const pathCtx = resolvePathContext(spec, {}, opts.projectId);
    const payload = await ctx.client.post(spec.listPath(pathCtx), {
      body: payloadBody,
    });

    printPayload(payload, ctx.config.output);
  });

  addPayloadOptions(
    addSelectConvenienceOptions(
      resource
        .command("update")
        .description(`Update ${spec.name}; target via --id/--by and payload via --json/--file/--set`)
        .option("--id <id>", "resource UUID")
        .option("--by <field=value>", "selector filter (repeatable)", collectOption, []),
    ),
  ).action(async (opts: MutationOptions, command: Command) => {
    const ctx = getContext(command);
    const target = await resolveTargetId(spec, opts, ctx.client);
    const payloadBody = buildPayload({
      json: opts.json,
      file: opts.file,
      sets: opts.set,
    });

    const payload = await ctx.client.patch(spec.itemPath(target.id, target.ctx), {
      body: payloadBody,
    });

    printPayload(payload, ctx.config.output);
  });

  addSelectConvenienceOptions(
    resource
      .command("delete")
      .description(`Delete ${spec.name}; target via --id/--by`)
      .option("--id <id>", "resource UUID")
      .option("--by <field=value>", "selector filter (repeatable)", collectOption, [])
      .option("--yes", "confirm deletion"),
  ).action(async (opts: DeleteOptions, command: Command) => {
    if (!opts.yes) {
      throw new CliUsageError("Deletion requires explicit --yes.");
    }

    const ctx = getContext(command);
    const target = await resolveTargetId(spec, opts, ctx.client);
    const payload = await ctx.client.delete(spec.itemPath(target.id, target.ctx));
    printPayload(payload, ctx.config.output);
  });
}

function registerBacklogCommands(resource: Command, getContext: ContextFactory): void {
  resource
    .command("add-story")
    .description("Add story to backlog")
    .requiredOption("--backlog-id <id>", "backlog id")
    .requiredOption("--story-id <id>", "story id")
    .requiredOption("--position <n>", "position", (raw) => parseIntegerOption(raw, "position"))
    .action(
      async (
        opts: { backlogId: string; storyId: string; position: number },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(
          `/v1/planning/backlogs/${opts.backlogId}/stories`,
          {
            body: { story_id: opts.storyId, position: opts.position },
          },
        );
        printPayload(payload, ctx.config.output);
      },
    );

  resource
    .command("remove-story")
    .description("Remove story from backlog")
    .requiredOption("--backlog-id <id>", "backlog id")
    .requiredOption("--story-id <id>", "story id")
    .action(async (opts: { backlogId: string; storyId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.delete(
        `/v1/planning/backlogs/${opts.backlogId}/stories/${opts.storyId}`,
      );
      printPayload(payload, ctx.config.output);
    });

  resource
    .command("add-task")
    .description("Add task to backlog")
    .requiredOption("--backlog-id <id>", "backlog id")
    .requiredOption("--task-id <id>", "task id")
    .requiredOption("--position <n>", "position", (raw) => parseIntegerOption(raw, "position"))
    .action(
      async (
        opts: { backlogId: string; taskId: string; position: number },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/backlogs/${opts.backlogId}/tasks`, {
          body: { task_id: opts.taskId, position: opts.position },
        });
        printPayload(payload, ctx.config.output);
      },
    );

  resource
    .command("remove-task")
    .description("Remove task from backlog")
    .requiredOption("--backlog-id <id>", "backlog id")
    .requiredOption("--task-id <id>", "task id")
    .action(async (opts: { backlogId: string; taskId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.delete(
        `/v1/planning/backlogs/${opts.backlogId}/tasks/${opts.taskId}`,
      );
      printPayload(payload, ctx.config.output);
    });

  addPayloadOptions(
    resource
      .command("reorder")
      .description("Reorder backlog stories/tasks")
      .requiredOption("--backlog-id <id>", "backlog id"),
  ).action(
    async (
      opts: { backlogId: string; json?: string; file?: string; set?: string[] },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const payloadBody = buildPayload({
        json: opts.json,
        file: opts.file,
        sets: opts.set,
      });

      const payload = await ctx.client.patch(`/v1/planning/backlogs/${opts.backlogId}/reorder`, {
        body: payloadBody,
      });
      printPayload(payload, ctx.config.output);
    },
  );

  resource
    .command("active-sprint")
    .description("Get active sprint board for a project with stories")
    .requiredOption("--project-id <id>", "project UUID")
    .action(async (opts: { projectId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.get("/v1/planning/backlogs/active-sprint", {
        query: { project_id: opts.projectId },
      });
      printPayload(payload, ctx.config.output);
    });
}

function registerLabelCommands(resource: Command, getContext: ContextFactory): void {
  resource
    .command("attach-story")
    .description("Attach label to a story")
    .requiredOption("--story-id <id>", "story UUID")
    .requiredOption("--label-id <id>", "label UUID")
    .action(async (opts: { storyId: string; labelId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.post(
        `/v1/planning/stories/${opts.storyId}/labels`,
        { body: { label_id: opts.labelId } },
      );
      printPayload(payload, ctx.config.output);
    });

  resource
    .command("detach-story")
    .description("Detach label from a story")
    .requiredOption("--story-id <id>", "story UUID")
    .requiredOption("--label-id <id>", "label UUID")
    .action(async (opts: { storyId: string; labelId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.delete(
        `/v1/planning/stories/${opts.storyId}/labels/${opts.labelId}`,
      );
      printPayload(payload, ctx.config.output);
    });

  resource
    .command("attach-task")
    .description("Attach label to a task")
    .requiredOption("--task-id <id>", "task UUID")
    .requiredOption("--label-id <id>", "label UUID")
    .action(async (opts: { taskId: string; labelId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.post(
        `/v1/planning/tasks/${opts.taskId}/labels`,
        { body: { label_id: opts.labelId } },
      );
      printPayload(payload, ctx.config.output);
    });

  resource
    .command("detach-task")
    .description("Detach label from a task")
    .requiredOption("--task-id <id>", "task UUID")
    .requiredOption("--label-id <id>", "label UUID")
    .action(async (opts: { taskId: string; labelId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.delete(
        `/v1/planning/tasks/${opts.taskId}/labels/${opts.labelId}`,
      );
      printPayload(payload, ctx.config.output);
    });
}

function registerTaskCommands(resource: Command, getContext: ContextFactory): void {
  const taskSpec = PLANNING_RESOURCES.task;

  addSelectConvenienceOptions(
    resource
      .command("assign")
      .description("Assign an agent to a task")
      .option("--id <id>", "task UUID")
      .option("--by <field=value>", "task selector filter (repeatable)", collectOption, [])
      .requiredOption("--agent-id <id>", "agent UUID")
      .option("--reason <text>", "assignment reason"),
  ).action(async (opts: TaskAssignOptions, command: Command) => {
    const ctx = getContext(command);
    const target = await resolveTargetId(taskSpec, opts, ctx.client);
    const payload = await ctx.client.post(
      `/v1/planning/tasks/${target.id}/assignments`,
      {
        body: {
          agent_id: opts.agentId,
          reason: opts.reason,
        },
      },
    );
    printPayload(payload, ctx.config.output);
  });

  addSelectConvenienceOptions(
    resource
      .command("unassign")
      .description("Unassign the current agent from a task")
      .option("--id <id>", "task UUID")
      .option("--by <field=value>", "task selector filter (repeatable)", collectOption, []),
  ).action(async (opts: TaskUnassignOptions, command: Command) => {
    const ctx = getContext(command);
    const target = await resolveTargetId(taskSpec, opts, ctx.client);
    const payload = await ctx.client.delete(
      `/v1/planning/tasks/${target.id}/assignments/current`,
    );
    printPayload(payload, ctx.config.output);
  });

  addSelectConvenienceOptions(
    resource
      .command("assignments")
      .description("List task assignment history")
      .option("--id <id>", "task UUID")
      .option("--by <field=value>", "task selector filter (repeatable)", collectOption, []),
  ).action(async (opts: TaskAssignmentsOptions, command: Command) => {
    const ctx = getContext(command);
    const target = await resolveTargetId(taskSpec, opts, ctx.client);
    const payload = await ctx.client.get(
      `/v1/planning/tasks/${target.id}/assignments`,
    );
    printPayload(payload, ctx.config.output);
  });
}

export function registerPlanningCommands(program: Command, getContext: ContextFactory): void {
  const order: PlanningResourceName[] = [
    "project",
    "epic",
    "story",
    "task",
    "backlog",
    "agent",
    "label",
  ];

  for (const name of order) {
    const spec = PLANNING_RESOURCES[name];
    const resource = program
      .command(name)
      .description(`${name} operations`)
      .showHelpAfterError();

    registerStandardResourceCommands(resource, spec, getContext);

    if (name === "backlog") {
      registerBacklogCommands(resource, getContext);
    }

    if (name === "task") {
      registerTaskCommands(resource, getContext);
    }

    if (name === "label") {
      registerLabelCommands(resource, getContext);
    }
  }
}
