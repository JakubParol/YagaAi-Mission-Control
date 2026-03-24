import assert from "node:assert/strict";
import test from "node:test";

import { Command } from "commander";

import type { RuntimeConfig } from "../../core/config";
import { CliUsageError } from "../../core/errors";
import type { ApiClient, RequestOptions } from "../../core/http";
import { registerPlanningCommands } from "./commands";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ClientCall {
  method: HttpMethod;
  path: string;
  options: RequestOptions | undefined;
}

class FakeApiClient {
  readonly calls: ClientCall[] = [];

  async get(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "GET", path, options });
    if (path === "/v1/planning/work-items/overview") {
      return {
        data: [
          {
            key: "MC-380",
            title: "Epic overview",
            status: "IN_PROGRESS",
            progress_pct: 50,
            children_done: 2,
            children_total: 4,
            blocked_count: 1,
            stale_days: 3,
          },
        ],
        meta: { total: 1, limit: 20, offset: 0 },
      };
    }
    return { data: [], meta: { total: 0, limit: 0, offset: 0 } };
  }

  async post(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "POST", path, options });
    return { data: { id: "stub" }, meta: {} };
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
  apiBaseUrl: "http://127.0.0.1:5000",
  apiBaseExplicit: true,
  output: "json",
  timeoutMs: 30_000,
};

function createProgram(client: FakeApiClient): Command {
  const program = new Command();
  program.name("mc").exitOverride();
  registerPlanningCommands(program, () => ({
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

test("epic overview maps sort aliases to API fields", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "epic",
    "overview",
    "--project-key",
    "MC",
    "--status",
    "IN_PROGRESS",
    "--is-blocked",
    "true",
    "--sort",
    "-progress,updated,blocked",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "GET",
      path: "/v1/planning/work-items/overview",
      options: {
        query: {
          project_key: "MC",
          status: "IN_PROGRESS",
          is_blocked: "true",
          sort: "-progress_pct,updated_at,blocked_count",
          type: "EPIC",
        },
      },
    },
  ]);
});

test("epic overview rejects unsupported sort alias", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await assert.rejects(
    run(program, ["epic", "overview", "--sort", "title"]),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /unsupported epic overview sort key/i);
      return true;
    },
  );
});

test("epic overview table output projects metric columns", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  const output = await run(program, [
    "epic",
    "overview",
    "--project-key",
    "MC",
    "--output",
    "table",
  ]);

  assert.match(output, /progress/i);
  assert.match(output, /done_total/i);
  assert.match(output, /50\.00%/i);
  assert.match(output, /2\/4/i);
});

test("epic stories uses work-items list with parent scope", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "epic",
    "stories",
    "--parent-key",
    "MC-380",
    "--project-key",
    "MC",
    "--status",
    "TODO,IN_PROGRESS",
    "--sort",
    "-updated_at",
    "--limit",
    "10",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "GET",
      path: "/v1/planning/work-items",
      options: {
        query: {
          parent_key: "MC-380",
          project_key: "MC",
          status: "TODO,IN_PROGRESS",
          sort: "-updated_at",
          limit: 10,
          type: "STORY",
        },
      },
    },
  ]);
});

test("epic stories requires parent identifier", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await assert.rejects(
    run(program, ["epic", "stories", "--project-key", "MC"]),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /provide --parent-id or --parent-key/i);
      return true;
    },
  );
});
