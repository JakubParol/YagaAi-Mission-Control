import { Command } from "commander";

import type { OutputMode } from "../../core/config";
import { CliUsageError } from "../../core/errors";
import { unwrapEnvelope } from "../../core/envelope";
import type { ApiClient } from "../../core/http";
import { collectOption, parseIntegerOption, parseKeyValueList } from "../../core/kv";
import { buildPayload, normalizeWorkItemPayload } from "../../core/payload";
import { printPayload } from "../../core/output";
import type { ContextFactory } from "../../core/runtime";
import {
  PLANNING_RESOURCES,
  WORK_ITEM_RESOURCES,
  type PathContext,
  type PlanningResourceName,
  type PlanningResourceSpec,
} from "./resources";

interface CommonFilterOptions {
  filter?: string[];
  projectId?: string;
  projectKey?: string;
  parentId?: string;
  parentKey?: string;
  status?: string;
  kind?: string;
  source?: string;
  isActive?: string;
  isBlocked?: string;
  subType?: string;
  assigneeId?: string;
  textSearch?: string;
  key?: string;
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
  setFile?: string[];
}

interface DeleteOptions extends SelectorOptions {
  yes?: boolean;
}

interface CreateOptions {
  json?: string;
  file?: string;
  set?: string[];
  setFile?: string[];
  projectId?: string;
}

interface TaskAssignOptions extends SelectorOptions {
  agentId: string;
  reason?: string;
}

type TaskUnassignOptions = SelectorOptions;

type TaskAssignmentsOptions = SelectorOptions;

interface BacklogProjectScopeOptions {
  projectId?: string;
  projectKey?: string;
}

interface EpicOverviewOptions {
  output?: OutputMode;
  projectId?: string;
  projectKey?: string;
  status?: string;
  isBlocked?: string;
  label?: string;
  assigneeId?: string;
  textSearch?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

interface EpicStoriesOptions extends CommonFilterOptions {
  output?: OutputMode;
  filter?: string[];
  sort?: string;
  limit?: number;
  offset?: number;
}

const EPIC_OVERVIEW_SORT_ALIASES: Record<string, string> = {
  priority: "priority",
  progress: "progress_pct",
  updated: "updated_at",
  blocked: "blocked_count",
};

function addSelectConvenienceOptions(command: Command): Command {
  return command
    .option("--project-id <id>", "filter by project UUID")
    .option("--project-key <key>", "filter by project key (e.g. MC)")
    .option("--parent-id <id>", "filter by parent work item UUID")
    .option("--parent-key <key>", "filter by parent work item key (e.g. MC-1)")
    .option("--status <status>", "status filter")
    .option("--kind <kind>", "kind filter")
    .option("--source <source>", "source filter")
    .option("--is-active <true|false>", "is_active filter")
    .option("--is-blocked <true|false>", "is_blocked filter")
    .option("--sub-type <type>", "sub_type filter (e.g. USER_STORY, SPIKE)")
    .option("--assignee-id <id>", "assignee agent id filter")
    .option("--text-search <text>", "text search filter")
    .option("--key <key>", "key filter")
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
    )
    .option(
      "--set-file <field=path>",
      "read field value from file (repeatable, preserves newlines)",
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
  validateMutuallyExclusive(opts.parentId, opts.parentKey, "--parent-id", "--parent-key");

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
  assign("parent_id", opts.parentId);
  assign("parent_key", opts.parentKey);
  assign("status", opts.status);
  assign("kind", opts.kind);
  assign("source", opts.source);
  assign("is_active", opts.isActive);
  assign("is_blocked", opts.isBlocked);
  assign("sub_type", opts.subType);
  assign("assignee_id", opts.assigneeId);
  assign("text_search", opts.textSearch);
  assign("key", opts.key);
  assign("openclaw_key", opts.openclawKey);

  return query;
}

function buildBacklogProjectScopeQuery(
  opts: BacklogProjectScopeOptions,
): Record<string, string> {
  validateMutuallyExclusive(opts.projectId, opts.projectKey, "--project-id", "--project-key");
  const query: Record<string, string> = {};
  if (opts.projectId) {
    query.project_id = opts.projectId;
  }
  if (opts.projectKey) {
    query.project_key = opts.projectKey;
  }
  return query;
}

function normalizeBacklogTransitionKind(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliUsageError("Backlog kind transition requires a non-empty string 'kind' value.");
  }
  return value;
}

function parseOutputModeOption(raw: string): OutputMode {
  const mode = raw.trim().toLowerCase();
  if (mode === "table" || mode === "json") {
    return mode;
  }
  throw new CliUsageError(`Invalid output mode '${raw}'. Expected: table or json.`);
}

function normalizeEpicOverviewSort(raw: string): string {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new CliUsageError("Epic overview sort cannot be empty.");
  }

  const normalized: string[] = [];
  for (const token of tokens) {
    const descending = token.startsWith("-");
    const base = descending ? token.slice(1) : token;
    const mapped = EPIC_OVERVIEW_SORT_ALIASES[base];
    if (!mapped) {
      const allowed = Object.keys(EPIC_OVERVIEW_SORT_ALIASES).join(", ");
      throw new CliUsageError(
        `Unsupported epic overview sort key '${base}'. Allowed keys: ${allowed}.`,
      );
    }
    normalized.push(descending ? `-${mapped}` : mapped);
  }

  return normalized.join(",");
}

function projectEpicOverviewTablePayload(payload: unknown): unknown {
  const envelope = unwrapEnvelope(payload);
  if (!Array.isArray(envelope.data)) {
    return payload;
  }

  const projected = envelope.data.map((row) => {
    if (!row || typeof row !== "object") {
      return row;
    }

    const item = row as Record<string, unknown>;
    const childrenDone = Number(item.children_done ?? 0);
    const childrenTotal = Number(item.children_total ?? 0);
    const blockedCount = Number(item.blocked_count ?? 0);
    const progressPct = Number(item.progress_pct ?? 0);
    const staleDays = Number(item.stale_days ?? 0);

    return {
      key: item.key ?? "",
      title: item.title ?? "",
      status: item.status ?? "",
      progress: `${progressPct.toFixed(2)}%`,
      done_total: `${childrenDone}/${childrenTotal}`,
      blocked: blockedCount,
      stale_days: staleDays,
    };
  });

  return {
    data: projected,
    meta: envelope.meta ?? {},
  };
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

  if (spec.defaultQuery) {
    for (const [key, value] of Object.entries(spec.defaultQuery)) {
      if (query[key] === undefined) {
        query[key] = value;
      }
    }
  }

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
      ...spec.defaultQuery,
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

  const createCommand = addPayloadOptions(
    resource
      .command("create")
      .description(`Create ${spec.name}; payload from --json/--file/--set`)
      .option("--project-id <id>", "project context for nested resources (required for epic)"),
  );

  if (spec.name === "project") {
    createCommand.addHelpText(
      "after",
      "\nExamples:\n" +
        "  mc project create --set key=MC --set name=\"Mission Control\" --set is_default=true\n" +
        "  mc project create --json '{\"key\":\"MC\",\"name\":\"Mission Control\",\"is_default\":true}'",
    );
  }

  if (spec.name === "agent") {
    createCommand.addHelpText(
      "after",
      "\nFallback precedence: avatar -> initials -> derived(name + last_name) -> first letter of name.\n" +
        "\nExamples:\n" +
        "  mc agent create --set openclaw_key=codex --set name=Codex --set last_name=Coder --set initials=CC --set avatar=https://cdn.example.com/codex.png\n" +
        "  mc agent create --json '{\"openclaw_key\":\"codex\",\"name\":\"Codex\",\"last_name\":\"Coder\",\"initials\":\"CC\",\"avatar\":\"/avatars/codex.png\"}'",
    );
  }

  createCommand.action(async (opts: CreateOptions, command: Command) => {
    const ctx = getContext(command);
    const payloadBody = buildPayload({
      json: opts.json,
      file: opts.file,
      sets: opts.set,
      setFiles: opts.setFile,
    });

    if (WORK_ITEM_RESOURCES.has(spec.name)) {
      normalizeWorkItemPayload(payloadBody);
    }

    if (spec.defaultQuery?.type && !Object.hasOwn(payloadBody, "type")) {
      payloadBody.type = spec.defaultQuery.type;
    }

    const pathCtx = resolvePathContext(spec, {}, opts.projectId);
    const payload = await ctx.client.post(spec.listPath(pathCtx), {
      body: payloadBody,
    });

    printPayload(payload, ctx.config.output);
  });

  const updateCommand = addPayloadOptions(
    addSelectConvenienceOptions(
      resource
        .command("update")
        .description(`Update ${spec.name}; target via --id/--by and payload via --json/--file/--set`)
        .option("--id <id>", "resource UUID")
        .option("--by <field=value>", "selector filter (repeatable)", collectOption, []),
    ),
  );

  if (spec.name === "project") {
    updateCommand.addHelpText(
      "after",
      "\nExamples:\n" +
        "  mc project update --id <uuid> --set is_default=true\n" +
        "  mc project update --by key=MC --set is_default=false",
    );
  }

  if (spec.name === "agent") {
    updateCommand.addHelpText(
      "after",
      "\nFallback precedence: avatar -> initials -> derived(name + last_name) -> first letter of name.\n" +
        "\nExamples:\n" +
        "  mc agent update --id <uuid> --set initials=CD --set avatar=/avatars/codex-v2.png\n" +
        "  mc agent update --by key=codex --set avatar=null\n" +
        "  mc agent update --by key=codex --set last_name=\n" +
        "  mc agent update --by key=codex --set initials=\n" +
        "  mc agent update --by key=codex --set avatar=",
    );
  }

  if (spec.name === "backlog") {
    updateCommand.addHelpText(
      "after",
      "\nKind transitions are routed to the lifecycle endpoint:\n" +
        "  mc backlog update --id <uuid> --set kind=SPRINT --project-key MC\n" +
        "  mc backlog transition-kind --id <uuid> --kind BACKLOG --project-key MC",
    );
  }

  updateCommand.action(async (opts: MutationOptions, command: Command) => {
    const ctx = getContext(command);
    const target = await resolveTargetId(spec, opts, ctx.client);
    const payloadBody = buildPayload({
      json: opts.json,
      file: opts.file,
      sets: opts.set,
      setFiles: opts.setFile,
    });

    if (WORK_ITEM_RESOURCES.has(spec.name)) {
      normalizeWorkItemPayload(payloadBody);
    }

    let payload: unknown;
    if (spec.name === "backlog" && Object.hasOwn(payloadBody, "kind")) {
      const payloadKeys = Object.keys(payloadBody);
      if (payloadKeys.length > 1) {
        throw new CliUsageError(
          "Backlog kind transition must be the only field in payload. Use 'mc backlog transition-kind' or run separate updates.",
        );
      }
      payload = await ctx.client.post(`/v1/planning/backlogs/${target.id}/transition-kind`, {
        query: buildBacklogProjectScopeQuery(opts),
        body: { kind: normalizeBacklogTransitionKind(payloadBody.kind) },
      });
    } else {
      payload = await ctx.client.patch(spec.itemPath(target.id, target.ctx), {
        body: payloadBody,
      });
    }

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
    .command("start")
    .description("Start sprint lifecycle for a backlog")
    .requiredOption("--id <id>", "backlog id")
    .option("--project-id <id>", "project UUID for scope validation")
    .option("--project-key <key>", "project key (e.g. MC) for scope validation")
    .action(
      async (
        opts: { id: string; projectId?: string; projectKey?: string },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/backlogs/${opts.id}/start`, {
          query: buildBacklogProjectScopeQuery(opts),
        });
        printPayload(payload, ctx.config.output);
      },
    );

  resource
    .command("complete")
    .description("Complete sprint lifecycle for a backlog")
    .requiredOption("--id <id>", "backlog id")
    .requiredOption("--target-backlog-id <id>", "target backlog for non-DONE items")
    .option("--project-id <id>", "project UUID for scope validation")
    .option("--project-key <key>", "project key (e.g. MC) for scope validation")
    .action(
      async (
        opts: { id: string; targetBacklogId: string; projectId?: string; projectKey?: string },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/backlogs/${opts.id}/complete`, {
          query: buildBacklogProjectScopeQuery(opts),
          body: { target_backlog_id: opts.targetBacklogId },
        });
        printPayload(payload, ctx.config.output);
      },
    );

  resource
    .command("transition-kind")
    .description("Transition backlog kind with API lifecycle guardrails")
    .requiredOption("--id <id>", "backlog id")
    .requiredOption("--kind <kind>", "target kind: BACKLOG | SPRINT | IDEAS")
    .option("--project-id <id>", "project UUID for scope validation")
    .option("--project-key <key>", "project key (e.g. MC) for scope validation")
    .action(
      async (
        opts: { id: string; kind: string; projectId?: string; projectKey?: string },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(
          `/v1/planning/backlogs/${opts.id}/transition-kind`,
          {
            query: buildBacklogProjectScopeQuery(opts),
            body: { kind: opts.kind },
          },
        );
        printPayload(payload, ctx.config.output);
      },
    );

  resource
    .command("add-item")
    .description("Add work item to backlog")
    .requiredOption("--backlog-id <id>", "backlog id")
    .requiredOption("--work-item-id <id>", "work item id")
    .option("--rank <rank>", "rank (LexoRank string)")
    .action(
      async (
        opts: { backlogId: string; workItemId: string; rank?: string },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(
          `/v1/planning/backlogs/${opts.backlogId}/items`,
          {
            body: {
              work_item_id: opts.workItemId,
              ...(opts.rank !== undefined ? { rank: opts.rank } : {}),
            },
          },
        );
        printPayload(payload, ctx.config.output);
      },
    );

  resource
    .command("remove-item")
    .description("Remove work item from backlog")
    .requiredOption("--backlog-id <id>", "backlog id")
    .requiredOption("--work-item-id <id>", "work item id")
    .action(async (opts: { backlogId: string; workItemId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.delete(
        `/v1/planning/backlogs/${opts.backlogId}/items/${opts.workItemId}`,
      );
      printPayload(payload, ctx.config.output);
    });

  resource
    .command("active-sprint")
    .description("Get active sprint board for a project with work items")
    .option("--project-id <id>", "project UUID")
    .option("--project-key <key>", "project key (e.g. MC)")
    .action(async (opts: { projectId?: string; projectKey?: string }, command: Command) => {
      validateMutuallyExclusive(opts.projectId, opts.projectKey, "--project-id", "--project-key");
      if (!opts.projectId && !opts.projectKey) {
        throw new CliUsageError("Provide --project-id or --project-key.");
      }
      const ctx = getContext(command);
      const query: Record<string, string> = {};
      if (opts.projectId) query.project_id = opts.projectId;
      if (opts.projectKey) query.project_key = opts.projectKey;
      const payload = await ctx.client.get("/v1/planning/backlogs/active-sprint", { query });
      printPayload(payload, ctx.config.output);
    });
}

function registerLabelCommands(resource: Command, getContext: ContextFactory): void {
  resource
    .command("attach")
    .description("Attach label to a work item")
    .requiredOption("--work-item-id <id>", "work item UUID")
    .requiredOption("--label-id <id>", "label UUID")
    .action(async (opts: { workItemId: string; labelId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.post(
        `/v1/planning/work-items/${opts.workItemId}/labels`,
        { body: { label_id: opts.labelId } },
      );
      printPayload(payload, ctx.config.output);
    });

  resource
    .command("detach")
    .description("Detach label from a work item")
    .requiredOption("--work-item-id <id>", "work item UUID")
    .requiredOption("--label-id <id>", "label UUID")
    .action(async (opts: { workItemId: string; labelId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.delete(
        `/v1/planning/work-items/${opts.workItemId}/labels/${opts.labelId}`,
      );
      printPayload(payload, ctx.config.output);
    });
}

function registerEpicCommands(resource: Command, getContext: ContextFactory): void {
  resource
    .command("overview")
    .description("List epic overview aggregate with filters and pagination")
    .option("--output <mode>", "output mode override: table|json", parseOutputModeOption)
    .option("--project-id <id>", "filter by project UUID")
    .option("--project-key <key>", "filter by project key (e.g. MC)")
    .option("--status <status>", "status filter")
    .option("--is-blocked <true|false>", "is_blocked filter")
    .option("--label <label>", "label filter")
    .option("--assignee-id <id>", "assignee agent id filter")
    .option("--text-search <text>", "text search filter")
    .option(
      "--sort <sort>",
      "sort aliases: priority,progress,updated,blocked (supports '-' prefix)",
    )
    .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
    .option("--offset <n>", "offset", (raw) => parseIntegerOption(raw, "offset"))
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  mc epic overview --project-key MC --status IN_PROGRESS --sort -progress\n" +
        "  mc epic overview --project-key MC --is-blocked true --sort -blocked --output table\n" +
        "  mc epic overview --project-key MC --label CLI --sort updated --output json",
    )
    .action(async (opts: EpicOverviewOptions, command: Command) => {
      validateMutuallyExclusive(opts.projectId, opts.projectKey, "--project-id", "--project-key");
      const ctx = getContext(command);
      const query: Record<string, string | number> = {};
      if (opts.projectId) query.project_id = opts.projectId;
      if (opts.projectKey) query.project_key = opts.projectKey;
      if (opts.status) query.status = opts.status;
      if (opts.isBlocked) query.is_blocked = opts.isBlocked;
      if (opts.label) query.label = opts.label;
      if (opts.assigneeId) query.assignee_id = opts.assigneeId;
      if (opts.textSearch) query.text_search = opts.textSearch;
      if (opts.sort) query.sort = normalizeEpicOverviewSort(opts.sort);
      if (opts.limit !== undefined) query.limit = opts.limit;
      if (opts.offset !== undefined) query.offset = opts.offset;

      const payload = await ctx.client.get("/v1/planning/work-items/overview", { query: { ...query, type: "EPIC" } });
      const outputMode = opts.output ?? ctx.config.output;
      if (outputMode === "table") {
        printPayload(projectEpicOverviewTablePayload(payload), outputMode);
        return;
      }
      printPayload(payload, outputMode);
    });

  addSelectConvenienceOptions(
    resource
      .command("stories")
      .description("List stories for a specific epic (drill-down)")
      .option("--output <mode>", "output mode override: table|json", parseOutputModeOption)
      .option("--filter <field=value>", "query filter (repeatable)", collectOption, [])
      .option("--sort <sort>", "sort spec, e.g. priority,-updated_at")
      .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
      .option("--offset <n>", "offset", (raw) => parseIntegerOption(raw, "offset")),
  )
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  mc epic stories --parent-key MC-380 --project-key MC\n" +
        "  mc epic stories --parent-key MC-380 --status TODO,IN_PROGRESS --sort -updated_at\n" +
        "  mc epic stories --parent-id <uuid> --output json",
    )
    .action(async (opts: EpicStoriesOptions, command: Command) => {
      validateMutuallyExclusive(opts.projectId, opts.projectKey, "--project-id", "--project-key");
      validateMutuallyExclusive(opts.parentId, opts.parentKey, "--parent-id", "--parent-key");
      if (!opts.parentId && !opts.parentKey) {
        throw new CliUsageError("Provide --parent-id or --parent-key for epic drill-down.");
      }

      const ctx = getContext(command);
      const query = mergeQuery({}, parseKeyValueList(opts.filter));
      mergeQuery(query, buildConvenienceQuery(opts));
      if (opts.sort) query.sort = opts.sort;
      if (opts.limit !== undefined) query.limit = opts.limit;
      if (opts.offset !== undefined) query.offset = opts.offset;

      const payload = await ctx.client.get("/v1/planning/work-items", { query: { ...query, type: "STORY" } });
      printPayload(payload, opts.output ?? ctx.config.output);
    });

  resource
    .command("children")
    .description("List children of an epic")
    .requiredOption("--id <id>", "epic UUID")
    .option("--type <type>", "child type filter (STORY, TASK, BUG)")
    .option("--status <status>", "status filter")
    .option("--sort <sort>", "sort spec")
    .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
    .option("--offset <n>", "offset", (raw) => parseIntegerOption(raw, "offset"))
    .action(
      async (
        opts: { id: string; type?: string; status?: string; sort?: string; limit?: number; offset?: number },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const query: Record<string, string | number> = {};
        if (opts.type) query.type = opts.type;
        if (opts.status) query.status = opts.status;
        if (opts.sort) query.sort = opts.sort;
        if (opts.limit !== undefined) query.limit = opts.limit;
        if (opts.offset !== undefined) query.offset = opts.offset;
        const payload = await ctx.client.get(
          `/v1/planning/work-items/${opts.id}/children`,
          { query },
        );
        printPayload(payload, ctx.config.output);
      },
    );
}


function registerAgentCommands(resource: Command, getContext: ContextFactory): void {
  resource
    .command("sync")
    .description("Sync agents from openclaw.json")
    .action(async (_opts: unknown, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.post("/v1/planning/agents/sync");
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
      `/v1/planning/work-items/${target.id}/assignments`,
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
      `/v1/planning/work-items/${target.id}/assignments/current`,
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
      `/v1/planning/work-items/${target.id}/assignments`,
    );
    printPayload(payload, ctx.config.output);
  });

  resource
    .command("children")
    .description("List children of a task (sub-tasks)")
    .requiredOption("--id <id>", "task UUID")
    .option("--type <type>", "child type filter")
    .option("--status <status>", "status filter")
    .option("--sort <sort>", "sort spec")
    .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
    .option("--offset <n>", "offset", (raw) => parseIntegerOption(raw, "offset"))
    .action(
      async (
        opts: { id: string; type?: string; status?: string; sort?: string; limit?: number; offset?: number },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const query: Record<string, string | number> = {};
        if (opts.type) query.type = opts.type;
        if (opts.status) query.status = opts.status;
        if (opts.sort) query.sort = opts.sort;
        if (opts.limit !== undefined) query.limit = opts.limit;
        if (opts.offset !== undefined) query.offset = opts.offset;
        const payload = await ctx.client.get(
          `/v1/planning/work-items/${opts.id}/children`,
          { query },
        );
        printPayload(payload, ctx.config.output);
      },
    );
}

function registerStoryCommands(resource: Command, getContext: ContextFactory): void {
  resource
    .command("children")
    .description("List children of a story (tasks)")
    .requiredOption("--id <id>", "story UUID")
    .option("--type <type>", "child type filter")
    .option("--status <status>", "status filter")
    .option("--sort <sort>", "sort spec")
    .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
    .option("--offset <n>", "offset", (raw) => parseIntegerOption(raw, "offset"))
    .action(
      async (
        opts: { id: string; type?: string; status?: string; sort?: string; limit?: number; offset?: number },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const query: Record<string, string | number> = {};
        if (opts.type) query.type = opts.type;
        if (opts.status) query.status = opts.status;
        if (opts.sort) query.sort = opts.sort;
        if (opts.limit !== undefined) query.limit = opts.limit;
        if (opts.offset !== undefined) query.offset = opts.offset;
        const payload = await ctx.client.get(
          `/v1/planning/work-items/${opts.id}/children`,
          { query },
        );
        printPayload(payload, ctx.config.output);
      },
    );
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

    if (name === "epic") {
      registerEpicCommands(resource, getContext);
    }

    if (name === "story") {
      registerStoryCommands(resource, getContext);
    }

    if (name === "agent") {
      registerAgentCommands(resource, getContext);
    }

    if (name === "label") {
      registerLabelCommands(resource, getContext);
    }
  }
}
