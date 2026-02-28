import { Command } from "commander";

import { parseIntegerOption } from "../../core/kv";
import { printPayload } from "../../core/output";
import type { ContextFactory } from "../../core/runtime";

export function registerObservabilityCommands(
  program: Command,
  getContext: ContextFactory,
): void {
  const obs = program.command("obs").description("observability operations").showHelpAfterError();

  obs
    .command("costs")
    .description("show cost summary")
    .option("--from <iso>", "start timestamp/date")
    .option("--to <iso>", "end timestamp/date")
    .option("--days <1|7|30>", "shortcut window", (raw) => parseIntegerOption(raw, "days"))
    .action(
      async (
        opts: { from?: string; to?: string; days?: number },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const payload = await ctx.client.get("/v1/observability/costs", {
          query: {
            from: opts.from,
            to: opts.to,
            days: opts.days,
          },
        });
        printPayload(payload, ctx.config.output);
      },
    );

  const requests = obs.command("requests").description("request-level observability");

  requests
    .command("list")
    .description("list requests")
    .option("--model <name>", "filter model")
    .option("--from <iso>", "from timestamp/date")
    .option("--to <iso>", "to timestamp/date")
    .option("--page <n>", "1-based page", (raw) => parseIntegerOption(raw, "page"))
    .option("--limit <n>", "page size", (raw) => parseIntegerOption(raw, "limit"))
    .action(
      async (
        opts: { model?: string; from?: string; to?: string; page?: number; limit?: number },
        command: Command,
      ) => {
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
        printPayload(payload, ctx.config.output);
      },
    );

  requests
    .command("models")
    .description("list available models")
    .action(async (_opts: unknown, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.get("/v1/observability/requests/models");
      printPayload(payload, ctx.config.output);
    });

  const importCmd = obs.command("import").description("langfuse import operations");

  importCmd
    .command("run")
    .description("trigger import")
    .action(async (_opts: unknown, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.post("/v1/observability/imports");
      printPayload(payload, ctx.config.output);
    });

  importCmd
    .command("status")
    .description("show import status")
    .action(async (_opts: unknown, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.get("/v1/observability/imports/status");
      printPayload(payload, ctx.config.output);
    });
}
