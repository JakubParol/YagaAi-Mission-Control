import { Command } from "commander";

import { isObject, unwrapEnvelope } from "../../core/envelope";
import { CliUsageError } from "../../core/errors";
import { parseIntegerOption } from "../../core/kv";
import { printPayload } from "../../core/output";
import type { ContextFactory } from "../../core/runtime";

const DEFAULT_COMMAND_TYPE = "orchestration.run.submit";
const DEFAULT_SCHEMA_VERSION = "1.0";
const DEFAULT_PRODUCER = "mc-cli";
const DEFAULT_TAIL_INTERVAL_MS = 2_000;
const DEFAULT_TAIL_LIMIT = 20;

interface TimelineRow {
  id?: string;
  occurred_at?: string;
  [key: string]: unknown;
}

function requirePositive(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new CliUsageError(`${name} must be a positive integer.`);
  }
  return value;
}

function parseTimelineRows(payload: unknown): { rows: TimelineRow[]; meta: unknown } {
  const { data, meta } = unwrapEnvelope(payload);
  if (!Array.isArray(data)) {
    throw new CliUsageError("timeline endpoint returned unexpected shape: expected data[]");
  }

  const rows = data.filter(isObject) as TimelineRow[];
  if (rows.length !== data.length) {
    throw new CliUsageError("timeline endpoint returned unexpected row shape");
  }

  return { rows, meta };
}

function compareTimelineAsc(left: TimelineRow, right: TimelineRow): number {
  const leftAt = typeof left.occurred_at === "string" ? left.occurred_at : "";
  const rightAt = typeof right.occurred_at === "string" ? right.occurred_at : "";
  if (leftAt !== rightAt) {
    return leftAt.localeCompare(rightAt);
  }

  const leftId = typeof left.id === "string" ? left.id : "";
  const rightId = typeof right.id === "string" ? right.id : "";
  return leftId.localeCompare(rightId);
}

function newestOccurredAt(rows: TimelineRow[], fallback?: string): string | undefined {
  let current = fallback;
  for (const row of rows) {
    const occurredAt = typeof row.occurred_at === "string" ? row.occurred_at : undefined;
    if (!occurredAt) {
      continue;
    }
    if (!current || occurredAt > current) {
      current = occurredAt;
    }
  }
  return current;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function registerOrchestrationCommands(
  program: Command,
  getContext: ContextFactory,
): void {
  const run = program.command("run").description("orchestration run operations").showHelpAfterError();

  run
    .command("submit")
    .description("submit a run command")
    .requiredOption("--run-id <id>", "run identifier")
    .option("--run-type <type>", "optional run type")
    .option("--correlation-id <id>", "command correlation id (defaults to run id)")
    .option("--causation-id <id>", "optional causation id")
    .option("--producer <name>", "command producer", DEFAULT_PRODUCER)
    .option("--occurred-at <iso>", "event occurred_at timestamp (defaults to now)")
    .option(
      "--command-type <type>",
      "command taxonomy (domain.aggregate.action)",
      DEFAULT_COMMAND_TYPE,
    )
    .option("--schema-version <ver>", "schema version", DEFAULT_SCHEMA_VERSION)
    .action(
      async (
        opts: {
          runId: string;
          runType?: string;
          correlationId?: string;
          causationId?: string;
          producer: string;
          occurredAt?: string;
          commandType: string;
          schemaVersion: string;
        },
        command: Command,
      ) => {
        const ctx = getContext(command);

        const commandPayload: Record<string, unknown> = { run_id: opts.runId };
        if (opts.runType) {
          commandPayload.run_type = opts.runType;
        }

        const payload = await ctx.client.post("/v1/orchestration/commands", {
          body: {
            command_type: opts.commandType,
            schema_version: opts.schemaVersion,
            payload: commandPayload,
            metadata: {
              producer: opts.producer,
              correlation_id: opts.correlationId ?? opts.runId,
              causation_id: opts.causationId ?? null,
              occurred_at: opts.occurredAt ?? new Date().toISOString(),
            },
          },
        });
        printPayload(payload, ctx.config.output);
      },
    );

  run
    .command("status")
    .description("get current run status")
    .requiredOption("--run-id <id>", "run identifier")
    .action(async (opts: { runId: string }, command: Command) => {
      const ctx = getContext(command);
      const payload = await ctx.client.get(`/v1/orchestration/runs/${opts.runId}`);
      printPayload(payload, ctx.config.output);
    });

  run
    .command("tail")
    .description("tail run timeline events")
    .requiredOption("--run-id <id>", "run identifier")
    .option("--status <status>", "optional run status filter")
    .option("--event-type <type>", "optional event type filter")
    .option("--occurred-after <iso>", "only events after timestamp")
    .option("--occurred-before <iso>", "only events before timestamp")
    .option(
      "--limit <n>",
      "batch size per poll",
      (raw) => requirePositive("limit", parseIntegerOption(raw, "limit")),
      DEFAULT_TAIL_LIMIT,
    )
    .option("--once", "single fetch (no follow mode)")
    .option(
      "--interval-ms <n>",
      "poll interval in milliseconds",
      (raw) => {
        const parsed = parseIntegerOption(raw, "interval-ms");
        if (parsed < 0) {
          throw new CliUsageError("interval-ms must be >= 0.");
        }
        return parsed;
      },
      DEFAULT_TAIL_INTERVAL_MS,
    )
    .option(
      "--max-polls <n>",
      "maximum polling iterations in follow mode",
      (raw) => requirePositive("max-polls", parseIntegerOption(raw, "max-polls")),
    )
    .action(
      async (
        opts: {
          runId: string;
          status?: string;
          eventType?: string;
          occurredAfter?: string;
          occurredBefore?: string;
          limit: number;
          once?: boolean;
          intervalMs: number;
          maxPolls?: number;
        },
        command: Command,
      ) => {
        const ctx = getContext(command);
        const seenIds = new Set<string>();

        let polls = 0;
        let occurredAfter = opts.occurredAfter;
        const follow = !opts.once;

        while (true) {
          const payload = await ctx.client.get("/v1/orchestration/timeline", {
            query: {
              run_id: opts.runId,
              status: opts.status,
              event_type: opts.eventType,
              occurred_after: occurredAfter,
              occurred_before: opts.occurredBefore,
              limit: opts.limit,
            },
          });

          const { rows, meta } = parseTimelineRows(payload);
          occurredAfter = newestOccurredAt(rows, occurredAfter);

          const fresh = rows.filter((row) => {
            const id = typeof row.id === "string" ? row.id : undefined;
            if (!id) {
              return true;
            }
            if (seenIds.has(id)) {
              return false;
            }
            seenIds.add(id);
            return true;
          });

          if (fresh.length > 0) {
            const sorted = [...fresh].sort(compareTimelineAsc);
            printPayload({ data: sorted, meta }, ctx.config.output);
          }

          polls += 1;
          if (!follow) {
            break;
          }
          if (opts.maxPolls !== undefined && polls >= opts.maxPolls) {
            break;
          }
          await sleep(opts.intervalMs);
        }
      },
    );
}
