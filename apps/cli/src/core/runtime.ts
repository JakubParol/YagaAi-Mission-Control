import type { Command } from "commander";

import type { RuntimeConfig } from "./config";
import type { ApiClient } from "./http";

export interface CommandContext {
  config: RuntimeConfig;
  client: ApiClient;
}

export type ContextFactory = (command: Command) => CommandContext;
