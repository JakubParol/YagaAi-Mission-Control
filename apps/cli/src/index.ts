#!/usr/bin/env node

import { Command, CommanderError } from "commander";

import {
  detectOutputModeFromArgv,
  resolveRuntimeConfig,
  type GlobalCliOptions,
} from "./core/config";
import { exitCodeForError, printCliError } from "./core/errors";
import { ApiClient } from "./core/http";
import { parseIntegerOption } from "./core/kv";
import type { CommandContext } from "./core/runtime";
import { printPayload } from "./core/output";
import { registerObservabilityCommands } from "./features/observability/commands";
import { registerPlanningCommands } from "./features/planning/commands";

function contextFromCommand(command: Command): CommandContext {
  const opts = command.optsWithGlobals<GlobalCliOptions>();
  const config = resolveRuntimeConfig(opts);
  return {
    config,
    client: new ApiClient(config),
  };
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("mc")
    .description("Mission Control CLI")
    .showHelpAfterError()
    .option("--api-base <url>", "Mission Control API base URL")
    .option("--actor-id <id>", "actor identity sent via X-Actor-Id")
    .option(
      "--actor-type <type>",
      "actor type sent via X-Actor-Type (human|agent|system)",
    )
    .option("--output <mode>", "output mode: table|json")
    .option(
      "--timeout-seconds <n>",
      "HTTP timeout in seconds",
      (raw) => parseIntegerOption(raw, "timeout-seconds"),
    )
    .exitOverride();

  registerPlanningCommands(program, contextFromCommand);
  registerObservabilityCommands(program, contextFromCommand);

  program
    .command("health")
    .description("check API health")
    .action(async (_opts: unknown, command: Command) => {
      const ctx = contextFromCommand(command);
      const payload = await ctx.client.get("/healthz");
      printPayload(payload, ctx.config.output);
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (error instanceof CommanderError) {
    if (typeof error.exitCode === "number") {
      process.exit(error.exitCode);
    }
    process.exit(1);
  }

  const output = detectOutputModeFromArgv(process.argv.slice(2));
  printCliError(error, output);
  process.exit(exitCodeForError(error));
});
