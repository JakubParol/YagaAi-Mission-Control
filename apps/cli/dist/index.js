#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const config_1 = require("./core/config");
const errors_1 = require("./core/errors");
const http_1 = require("./core/http");
const kv_1 = require("./core/kv");
const output_1 = require("./core/output");
const commands_1 = require("./features/observability/commands");
const commands_2 = require("./features/planning/commands");
function contextFromCommand(command) {
    const opts = command.optsWithGlobals();
    const config = (0, config_1.resolveRuntimeConfig)(opts);
    return {
        config,
        client: new http_1.ApiClient(config),
    };
}
async function main() {
    const program = new commander_1.Command();
    program
        .name("mc")
        .description("Mission Control CLI")
        .showHelpAfterError()
        .option("--api-base <url>", "Mission Control API base URL")
        .option("--actor-id <id>", "actor identity sent via X-Actor-Id")
        .option("--actor-type <type>", "actor type sent via X-Actor-Type (human|agent|system)")
        .option("--output <mode>", "output mode: table|json")
        .option("--timeout-seconds <n>", "HTTP timeout in seconds", (raw) => (0, kv_1.parseIntegerOption)(raw, "timeout-seconds"))
        .exitOverride();
    (0, commands_2.registerPlanningCommands)(program, contextFromCommand);
    (0, commands_1.registerObservabilityCommands)(program, contextFromCommand);
    program
        .command("health")
        .description("check API health")
        .action(async (_opts, command) => {
        const ctx = contextFromCommand(command);
        const payload = await ctx.client.get("/healthz");
        (0, output_1.printPayload)(payload, ctx.config.output);
    });
    await program.parseAsync(process.argv);
}
main().catch((error) => {
    if (error instanceof commander_1.CommanderError) {
        if (typeof error.exitCode === "number") {
            process.exit(error.exitCode);
        }
        process.exit(1);
    }
    const output = (0, config_1.detectOutputModeFromArgv)(process.argv.slice(2));
    (0, errors_1.printCliError)(error, output);
    process.exit((0, errors_1.exitCodeForError)(error));
});
