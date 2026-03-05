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
    return { data: [], meta: { total: 0, limit: 0, offset: 0 } };
  }

  async post(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "POST", path, options });
    return { data: { id: "backlog-1" }, meta: {} };
  }

  async patch(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "PATCH", path, options });
    return { data: { id: "backlog-1" }, meta: {} };
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
  registerPlanningCommands(program, () => ({
    config: TEST_CONFIG,
    client: client as unknown as ApiClient,
  }));
  return program;
}

async function run(program: Command, args: string[]): Promise<void> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    await program.parseAsync(["node", "mc", ...args], { from: "node" });
  } finally {
    console.log = originalLog;
  }
}

test("backlog start posts lifecycle request with project_key scope", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "backlog",
    "start",
    "--id",
    "b-1",
    "--project-key",
    "MC",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "POST",
      path: "/v1/planning/backlogs/b-1/start",
      options: { query: { project_key: "MC" } },
    },
  ]);
});

test("backlog complete posts lifecycle request with project_id scope", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "backlog",
    "complete",
    "--id",
    "b-2",
    "--project-id",
    "p-1",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "POST",
      path: "/v1/planning/backlogs/b-2/complete",
      options: { query: { project_id: "p-1" } },
    },
  ]);
});

test("backlog transition-kind posts lifecycle mutation with request body", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "backlog",
    "transition-kind",
    "--id",
    "b-3",
    "--kind",
    "SPRINT",
    "--project-key",
    "MC",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "POST",
      path: "/v1/planning/backlogs/b-3/transition-kind",
      options: { query: { project_key: "MC" }, body: { kind: "SPRINT" } },
    },
  ]);
});

test("backlog update with kind routes to transition-kind endpoint", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "backlog",
    "update",
    "--id",
    "b-4",
    "--set",
    "kind=IDEAS",
    "--project-id",
    "p-2",
  ]);

  assert.deepEqual(client.calls, [
    {
      method: "POST",
      path: "/v1/planning/backlogs/b-4/transition-kind",
      options: { query: { project_id: "p-2" }, body: { kind: "IDEAS" } },
    },
  ]);
});

test("backlog update rejects mixed kind and non-kind fields", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await assert.rejects(
    run(program, [
      "backlog",
      "update",
      "--id",
      "b-5",
      "--set",
      "kind=SPRINT",
      "--set",
      "name=Q2 Sprint",
    ]),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /kind transition must be the only field/i);
      return true;
    },
  );
});

test("backlog start rejects mutually exclusive project scope flags", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await assert.rejects(
    run(program, [
      "backlog",
      "start",
      "--id",
      "b-6",
      "--project-id",
      "p-6",
      "--project-key",
      "MC",
    ]),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /mutually exclusive/i);
      return true;
    },
  );
});
