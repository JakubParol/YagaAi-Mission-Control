"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerObservabilityCommands = registerObservabilityCommands;
const kv_1 = require("../../core/kv");
const output_1 = require("../../core/output");
function registerObservabilityCommands(program, getContext) {
    const obs = program.command("obs").description("observability operations").showHelpAfterError();
    obs
        .command("costs")
        .description("show cost summary")
        .option("--from <iso>", "start timestamp/date")
        .option("--to <iso>", "end timestamp/date")
        .option("--days <1|7|30>", "shortcut window", (raw) => (0, kv_1.parseIntegerOption)(raw, "days"))
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.get("/v1/observability/costs", {
            query: {
                from: opts.from,
                to: opts.to,
                days: opts.days,
            },
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    const requests = obs.command("requests").description("request-level observability");
    requests
        .command("list")
        .description("list requests")
        .option("--model <name>", "filter model")
        .option("--from <iso>", "from timestamp/date")
        .option("--to <iso>", "to timestamp/date")
        .option("--page <n>", "1-based page", (raw) => (0, kv_1.parseIntegerOption)(raw, "page"))
        .option("--limit <n>", "page size", (raw) => (0, kv_1.parseIntegerOption)(raw, "limit"))
        .action(async (opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.get("/v1/observability/requests", {
            query: {
                model: opts.model,
                from: opts.from,
                to: opts.to,
                page: opts.page,
                limit: opts.limit,
            },
        });
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    requests
        .command("models")
        .description("list available models")
        .action(async (_opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.get("/v1/observability/requests/models");
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    const importCmd = obs.command("import").description("langfuse import operations");
    importCmd
        .command("run")
        .description("trigger import")
        .action(async (_opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.post("/v1/observability/imports");
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    importCmd
        .command("status")
        .description("show import status")
        .action(async (_opts, command) => {
        const ctx = getContext(command);
        const payload = await ctx.client.get("/v1/observability/imports/status");
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
}
