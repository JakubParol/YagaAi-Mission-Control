import assert from "node:assert/strict";
import test from "node:test";

import { Command } from "commander";

import type { RuntimeConfig } from "../../core/config";
import type { ApiClient, RequestOptions } from "../../core/http";
import { registerOrchestrationCommands } from "./commands";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ClientCall {
  method: HttpMethod;
  path: string;
  options: RequestOptions | undefined;
}

class FakeApiClient {
  readonly calls: ClientCall[] = [];
  private timelineCount = 0;

  async get(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "GET", path, options });

    if (path === "/v1/orchestration/runs/run-123") {
      return { data: { run_id: "run-123", status: "RUNNING" }, meta: {} };
    }

    if (path === "/v1/orchestration/timeline") {
      this.timelineCount += 1;
      if (this.timelineCount === 1) {
        return {
          data: [
            { id: "evt-2", occurred_at: "2026-03-08T10:00:01.000Z", event_type: "b" },
            { id: "evt-1", occurred_at: "2026-03-08T10:00:00.000Z", event_type: "a" },
          ],
          meta: { total: 2, limit: 20, offset: 0 },
        };
      }

      return {
        data: [
          { id: "evt-3", occurred_at: "2026-03-08T10:00:02.000Z", event_type: "c" },
        ],
        meta: { total: 1, limit: 20, offset: 0 },
      };
    }

    return { data: [], meta: { total: 0, limit: 0, offset: 0 } };
  }

  async post(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "POST", path, options });
    return { data: { status: "ACCEPTED" }, meta: {} };
  }

  async patch(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "PATCH", path, options });
    return { data: { id: "stub" }, meta: {} };
  }

  async delete(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "DELETE", path, options });
    return { data: null, meta: {} };
  }
}

const TEST_CONFIG: RuntimeConfig = {
  apiBaseUrl: "http://127.0.0.1:8080",
  output: "json",
  timeoutMs: 30_000,
};

function createProgram(client: FakeApiClient): Command {
  const program = new Command();
  program.name("mc").exitOverride();
  registerOrchestrationCommands(program, () => ({
    config: TEST_CONFIG,
    client: client as unknown as ApiClient,
  }));
  return program;
}

async function run(program: Command, args: string[]): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...items: unknown[]) => {
    lines.push(items.map((item) => String(item)).join(" "));
  };
  try {
    await program.parseAsync(["node", "mc", ...args], { from: "node" });
    return lines.join("\n");
  } finally {
    console.log = originalLog;
  }
}

test("run submit posts command envelope with defaults", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["run", "submit", "--run-id", "run-123"]);

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0]?.method, "POST");
  assert.equal(client.calls[0]?.path, "/v1/orchestration/commands");

  const body = client.calls[0]?.options?.body as Record<string, unknown>;
  assert.equal(body.command_type, "orchestration.run.submit");
  assert.equal(body.schema_version, "1.0");

  const payload = body.payload as Record<string, unknown>;
  assert.equal(payload.run_id, "run-123");

  const metadata = body.metadata as Record<string, unknown>;
  assert.equal(metadata.producer, "mc-cli");
  assert.equal(metadata.correlation_id, "run-123");
  assert.equal(metadata.causation_id, null);
  assert.equal(typeof metadata.occurred_at, "string");
});

test("run status fetches run read model by id", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["run", "status", "--run-id", "run-123"]);

  assert.deepEqual(client.calls, [
    {
      method: "GET",
      path: "/v1/orchestration/runs/run-123",
      options: undefined,
    },
  ]);
});

test("run status URL-encodes run id path segment", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["run", "status", "--run-id", "run/123"]);

  assert.deepEqual(client.calls, [
    {
      method: "GET",
      path: "/v1/orchestration/runs/run%2F123",
      options: undefined,
    },
  ]);
});

test("run tail once fetches timeline with filters", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "run",
    "tail",
    "--run-id",
    "run-123",
    "--status",
    "RUNNING",
    "--event-type",
    "orchestration.run.step.completed",
    "--limit",
    "5",
    "--once",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "GET",
      path: "/v1/orchestration/timeline",
      options: {
        query: {
          run_id: "run-123",
          status: "RUNNING",
          event_type: "orchestration.run.step.completed",
          occurred_after: undefined,
          occurred_before: undefined,
          limit: 5,
        },
      },
    },
  ]);
});

test("run tail follow advances occurred_after cursor", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "run",
    "tail",
    "--run-id",
    "run-123",
    "--max-polls",
    "2",
    "--interval-ms",
    "0",
  ]);

  assert.equal(client.calls.length, 2);

  const firstQuery = client.calls[0]?.options?.query as Record<string, unknown>;
  const secondQuery = client.calls[1]?.options?.query as Record<string, unknown>;

  assert.equal(firstQuery.run_id, "run-123");
  assert.equal(firstQuery.occurred_after, undefined);
  assert.equal(secondQuery.occurred_after, "2026-03-08T10:00:01.000Z");
});
