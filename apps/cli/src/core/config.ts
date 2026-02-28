import process from "node:process";

export type OutputMode = "table" | "json";

export interface GlobalCliOptions {
  apiBase?: string;
  actorId?: string;
  actorType?: string;
  output?: string;
  timeoutSeconds?: number;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  actorId?: string;
  actorType?: string;
  output: OutputMode;
  timeoutMs: number;
}

const DEFAULT_API_BASE = "http://127.0.0.1:8080";
const DEFAULT_OUTPUT: OutputMode = "table";
const DEFAULT_TIMEOUT_SECONDS = 30;

function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function parseOutputMode(value: string | undefined): OutputMode {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) {
    return DEFAULT_OUTPUT;
  }
  if (raw === "table" || raw === "json") {
    return raw;
  }
  throw new Error(`Invalid output mode '${value}'. Expected: table or json.`);
}

function parseTimeoutSeconds(value: number | string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_TIMEOUT_SECONDS;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid timeout value '${value}'. It must be a positive integer.`);
  }
  return parsed;
}

export function resolveRuntimeConfig(cli: GlobalCliOptions = {}): RuntimeConfig {
  const apiBaseUrl = normalizeApiBase(
    cli.apiBase ?? process.env.MC_API_BASE_URL ?? DEFAULT_API_BASE,
  );

  const actorId = cli.actorId ?? process.env.MC_ACTOR_ID;
  const actorType = cli.actorType ?? process.env.MC_ACTOR_TYPE;

  const output = parseOutputMode(cli.output ?? process.env.MC_OUTPUT);
  const timeoutSeconds = parseTimeoutSeconds(
    cli.timeoutSeconds ?? process.env.MC_TIMEOUT_SECONDS,
  );

  return {
    apiBaseUrl,
    actorId: actorId && actorId.trim() ? actorId.trim() : undefined,
    actorType: actorType && actorType.trim() ? actorType.trim() : undefined,
    output,
    timeoutMs: timeoutSeconds * 1000,
  };
}

export function detectOutputModeFromArgv(argv: string[]): OutputMode {
  const inline = argv.find((part) => part.startsWith("--output="));
  if (inline) {
    return parseOutputMode(inline.split("=", 2)[1]);
  }

  const idx = argv.findIndex((part) => part === "--output");
  if (idx >= 0 && idx + 1 < argv.length) {
    return parseOutputMode(argv[idx + 1]);
  }

  return parseOutputMode(process.env.MC_OUTPUT);
}
