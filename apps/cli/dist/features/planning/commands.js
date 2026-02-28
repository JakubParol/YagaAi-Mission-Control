"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlanningCommands = registerPlanningCommands;
const errors_1 = require("../../core/errors");
const envelope_1 = require("../../core/envelope");
const kv_1 = require("../../core/kv");
const payload_1 = require("../../core/payload");
const output_1 = require("../../core/output");
const resources_1 = require("./resources");
function addSelectConvenienceOptions(command) {
    return command
        .option("--project-id <id>", "project context/filter")
        .option("--epic-id <id>", "epic filter")
        .option("--story-id <id>", "story filter")
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
function addPayloadOptions(command) {
    return command
        .option("--json <json>", "JSON object payload")
        .option("--file <path>", "path to JSON payload file")
        .option("--set <field=value>", "payload field override (repeatable)", kv_1.collectOption, []);
}
function mergeQuery(target, input) {
    for (const [key, value] of Object.entries(input)) {
        if (target[key] !== undefined && target[key] !== value) {
            throw new errors_1.CliUsageError(`Conflicting values for '${key}': '${target[key]}' and '${value}'.`);
        }
        target[key] = value;
    }
    return target;
}
function buildConvenienceQuery(opts) {
    const query = {};
    const assign = (key, value) => {
        if (value === undefined || value === "")
            return;
        const prev = query[key];
        if (prev !== undefined && prev !== value) {
            throw new errors_1.CliUsageError(`Conflicting values for '${key}': '${prev}' and '${value}'.`);
        }
        query[key] = value;
    };
    assign("project_id", opts.projectId);
    assign("epic_id", opts.epicId);
    assign("story_id", opts.storyId);
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
function resolvePathContext(spec, query, explicitProjectId) {
    const projectIdFromQuery = typeof query.project_id === "string" ? query.project_id : undefined;
    const projectId = explicitProjectId ?? projectIdFromQuery;
    if (spec.requiredContext.includes("projectId") && !projectId) {
        throw new errors_1.CliUsageError(`${spec.name} command requires --project-id because API path is nested by project.`);
    }
    if (spec.requiredContext.includes("projectId")) {
        delete query.project_id;
    }
    return { projectId };
}
function buildListQuery(spec, opts) {
    const query = mergeQuery({}, (0, kv_1.parseKeyValueList)(opts.filter));
    mergeQuery(query, buildConvenienceQuery(opts));
    if (opts.sort) {
        query.sort = opts.sort;
    }
    else if (spec.defaultSort) {
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
function buildSelectorQuery(spec, opts) {
    const merged = mergeQuery({}, (0, kv_1.parseKeyValueList)(opts.by));
    mergeQuery(merged, buildConvenienceQuery(opts));
    const selectors = {};
    for (const [key, value] of Object.entries(merged)) {
        selectors[key] = String(value);
    }
    const ctx = resolvePathContext(spec, selectors, opts.projectId);
    return { selectors, ctx };
}
function ensureSingleMatch(resourceName, payload) {
    const { data } = (0, envelope_1.unwrapEnvelope)(payload);
    if (!Array.isArray(data)) {
        throw new errors_1.CliUsageError(`Cannot resolve ${resourceName} selector because list response is not an array.`);
    }
    if (data.length === 0) {
        throw new errors_1.CliUsageError(`${resourceName} not found for provided selector.`);
    }
    if (data.length > 1) {
        const ids = data
            .map((row) => (row && typeof row === "object" && "id" in row ? row.id : null))
            .filter((id) => typeof id === "string");
        const suffix = ids.length > 0 ? ` Matching ids: ${ids.join(", ")}` : "";
        throw new errors_1.CliUsageError(`Selector for ${resourceName} is ambiguous (${data.length} results). Add more --by filters.${suffix}`);
    }
    const row = data[0];
    if (!row || typeof row !== "object" || !("id" in row)) {
        throw new errors_1.CliUsageError(`Cannot resolve ${resourceName} id from list response.`);
    }
    const id = row.id;
    if (typeof id !== "string" || !id) {
        throw new errors_1.CliUsageError(`Cannot resolve ${resourceName} id from selector result.`);
    }
    return id;
}
async function resolveTargetId(spec, opts, getContext, command) {
    if (opts.id) {
        const quickCtx = resolvePathContext(spec, {}, opts.projectId);
        return { id: opts.id, ctx: quickCtx };
    }
    const { selectors, ctx } = buildSelectorQuery(spec, opts);
    if (Object.keys(selectors).length === 0) {
        throw new errors_1.CliUsageError("Provide --id or at least one selector via --by field=value.");
    }
    const client = getContext(command).client;
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
function registerStandardResourceCommands(resource, spec, getContext) {
    addSelectConvenienceOptions(resource
        .command("list")
        .description(`List ${spec.name} records with optional multi-field filters`)
        .option("--filter <field=value>", "query filter (repeatable)", kv_1.collectOption, [])
        .option("--sort <sort>", "sort spec, e.g. priority,-updated_at")
        .option("--limit <n>", "page size", (raw) => (0, kv_1.parseIntegerOption)(raw, "limit"))
        .option("--offset <n>", "offset", (raw) => (0, kv_1.parseIntegerOption)(raw, "offset"))).action(async (opts, command) => {
        const ctx = getContext(command);
        const { query, ctx: pathCtx } = buildListQuery(spec, opts);
        const payload = await ctx.client.get(spec.listPath(pathCtx), { query });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addSelectConvenienceOptions(resource
        .command("get")
        .description(`Get a single ${spec.name} by --id or selector fields`)
        .option("--id <id>", "resource UUID")
        .option("--by <field=value>", "selector filter (repeatable)", kv_1.collectOption, [])).action(async (opts, command) => {
        const ctx = getContext(command);
        const target = await resolveTargetId(spec, opts, getContext, command);
        const payload = await ctx.client.get(spec.itemPath(target.id, target.ctx));
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addPayloadOptions(resource
        .command("create")
        .description(`Create ${spec.name}; payload from --json/--file/--set`)
        .option("--project-id <id>", "project context for nested resources (required for epic)")).action(async (opts, command) => {
        const ctx = getContext(command);
        const payloadBody = (0, payload_1.buildPayload)({
            json: opts.json,
            file: opts.file,
            sets: opts.set,
        });
        const pathCtx = resolvePathContext(spec, {}, opts.projectId);
        const payload = await ctx.client.post(spec.listPath(pathCtx), {
            body: payloadBody,
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addPayloadOptions(addSelectConvenienceOptions(resource
        .command("update")
        .description(`Update ${spec.name}; target via --id/--by and payload via --json/--file/--set`)
        .option("--id <id>", "resource UUID")
        .option("--by <field=value>", "selector filter (repeatable)", kv_1.collectOption, []))).action(async (opts, command) => {
        const ctx = getContext(command);
        const target = await resolveTargetId(spec, opts, getContext, command);
        const payloadBody = (0, payload_1.buildPayload)({
            json: opts.json,
            file: opts.file,
            sets: opts.set,
        });
        const payload = await ctx.client.patch(spec.itemPath(target.id, target.ctx), {
            body: payloadBody,
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addSelectConvenienceOptions(resource
        .command("delete")
        .description(`Delete ${spec.name}; target via --id/--by`)
        .option("--id <id>", "resource UUID")
        .option("--by <field=value>", "selector filter (repeatable)", kv_1.collectOption, [])
        .option("--yes", "confirm deletion")).action(async (opts, command) => {
        if (!opts.yes) {
            throw new errors_1.CliUsageError("Deletion requires explicit --yes.");
        }
        const ctx = getContext(command);
        const target = await resolveTargetId(spec, opts, getContext, command);
        const payload = await ctx.client.delete(spec.itemPath(target.id, target.ctx));
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
}
function registerBacklogCommands(resource, getContext) {
    resource
        .command("add-story")
        .description("Add story to backlog")
        .requiredOption("--backlog-id <id>", "backlog id")
        .requiredOption("--story-id <id>", "story id")
        .requiredOption("--position <n>", "position", (raw) => (0, kv_1.parseIntegerOption)(raw, "position"))
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/backlogs/${opts.backlogId}/stories`, {
            body: { story_id: opts.storyId, position: opts.position },
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    resource
        .command("remove-story")
        .description("Remove story from backlog")
        .requiredOption("--backlog-id <id>", "backlog id")
        .requiredOption("--story-id <id>", "story id")
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.delete(`/v1/planning/backlogs/${opts.backlogId}/stories/${opts.storyId}`);
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    resource
        .command("add-task")
        .description("Add task to backlog")
        .requiredOption("--backlog-id <id>", "backlog id")
        .requiredOption("--task-id <id>", "task id")
        .requiredOption("--position <n>", "position", (raw) => (0, kv_1.parseIntegerOption)(raw, "position"))
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/backlogs/${opts.backlogId}/tasks`, {
            body: { task_id: opts.taskId, position: opts.position },
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    resource
        .command("remove-task")
        .description("Remove task from backlog")
        .requiredOption("--backlog-id <id>", "backlog id")
        .requiredOption("--task-id <id>", "task id")
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.delete(`/v1/planning/backlogs/${opts.backlogId}/tasks/${opts.taskId}`);
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addPayloadOptions(resource
        .command("reorder")
        .description("Reorder backlog stories/tasks")
        .requiredOption("--backlog-id <id>", "backlog id")).action(async (opts, command) => {
        const ctx = getContext(command);
        const payloadBody = (0, payload_1.buildPayload)({
            json: opts.json,
            file: opts.file,
            sets: opts.set,
        });
        const payload = await ctx.client.patch(`/v1/planning/backlogs/${opts.backlogId}/reorder`, {
            body: payloadBody,
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
}
function registerLabelCommands(resource, getContext) {
    resource
        .command("attach-story")
        .description("Attach label to a story")
        .requiredOption("--story-id <id>", "story UUID")
        .requiredOption("--label-id <id>", "label UUID")
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/stories/${opts.storyId}/labels`, { body: { label_id: opts.labelId } });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    resource
        .command("detach-story")
        .description("Detach label from a story")
        .requiredOption("--story-id <id>", "story UUID")
        .requiredOption("--label-id <id>", "label UUID")
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.delete(`/v1/planning/stories/${opts.storyId}/labels/${opts.labelId}`);
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    resource
        .command("attach-task")
        .description("Attach label to a task")
        .requiredOption("--task-id <id>", "task UUID")
        .requiredOption("--label-id <id>", "label UUID")
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post(`/v1/planning/tasks/${opts.taskId}/labels`, { body: { label_id: opts.labelId } });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    resource
        .command("detach-task")
        .description("Detach label from a task")
        .requiredOption("--task-id <id>", "task UUID")
        .requiredOption("--label-id <id>", "label UUID")
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.delete(`/v1/planning/tasks/${opts.taskId}/labels/${opts.labelId}`);
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
}
function registerTaskCommands(resource, getContext) {
    const taskSpec = resources_1.PLANNING_RESOURCES.task;
    addSelectConvenienceOptions(resource
        .command("assign")
        .description("Assign an agent to a task")
        .option("--id <id>", "task UUID")
        .option("--by <field=value>", "task selector filter (repeatable)", kv_1.collectOption, [])
        .requiredOption("--agent-id <id>", "agent UUID")
        .option("--reason <text>", "assignment reason")).action(async (opts, command) => {
        const ctx = getContext(command);
        const target = await resolveTargetId(taskSpec, opts, getContext, command);
        const payload = await ctx.client.post(`/v1/planning/tasks/${target.id}/assignments`, {
            body: {
                agent_id: opts.agentId,
                reason: opts.reason,
            },
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addSelectConvenienceOptions(resource
        .command("unassign")
        .description("Unassign the current agent from a task")
        .option("--id <id>", "task UUID")
        .option("--by <field=value>", "task selector filter (repeatable)", kv_1.collectOption, [])).action(async (opts, command) => {
        const ctx = getContext(command);
        const target = await resolveTargetId(taskSpec, opts, getContext, command);
        const payload = await ctx.client.delete(`/v1/planning/tasks/${target.id}/assignments/current`);
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    addSelectConvenienceOptions(resource
        .command("assignments")
        .description("List task assignment history")
        .option("--id <id>", "task UUID")
        .option("--by <field=value>", "task selector filter (repeatable)", kv_1.collectOption, [])).action(async (opts, command) => {
        const ctx = getContext(command);
        const target = await resolveTargetId(taskSpec, opts, getContext, command);
        const payload = await ctx.client.get(`/v1/planning/tasks/${target.id}/assignments`);
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
}
function registerPlanningCommands(program, getContext) {
    const order = [
        "project",
        "epic",
        "story",
        "task",
        "backlog",
        "agent",
        "label",
    ];
    for (const name of order) {
        const spec = resources_1.PLANNING_RESOURCES[name];
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
