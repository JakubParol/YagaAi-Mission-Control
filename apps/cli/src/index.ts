#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config";
import { ApiClient } from "./client";
import { registerProjectsCommand } from "./commands/projects";
import { registerEpicsCommand } from "./commands/epics";
import { registerStoriesCommand } from "./commands/stories";
import { registerTasksCommand } from "./commands/tasks";

const program = new Command();

program
  .name("mc")
  .description("Mission Control CLI — manage projects, epics, stories, and tasks")
  .version("0.1.0")
  .option("--api-url <url>", "API base URL (env: MC_API_URL)")
  .option("--json", "Output raw JSON instead of tables", false);

// Config and client are created at parse time via preAction hook
// so that --api-url global option is available
let client: ApiClient;

program.hook("preAction", () => {
  const opts = program.opts();
  client = new ApiClient(
    loadConfig({ apiUrl: opts.apiUrl, jsonOutput: opts.json })
  );
});

// Placeholder client for command registration (replaced by hook before any action runs)
client = new ApiClient(loadConfig());

registerProjectsCommand(program, client);
registerEpicsCommand(program, client);
registerStoriesCommand(program, client);
registerTasksCommand(program, client);

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
