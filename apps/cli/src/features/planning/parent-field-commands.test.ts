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
    return { data: [{ id: "wi-1" }], meta: { total: 1, limit: 20, offset: 0 } };
  }

  async post(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "POST", path, options });
    return { data: { id: "wi-1" }, meta: {} };
  }

  async patch(path: string, options?: RequestOptions): Promise<unknown> {
    this.calls.push({ method: "PATCH", path, options });
    return { data: { id: "wi-1" }, meta: {} };
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

async function run(program: Command, args: string[]): Promise<void> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    await program.parseAsync(["node", "mc", ...args], { from: "node" });
  } finally {
    console.log = originalLog;
  }
}

// --- story create: epic_id normalized to parent_id ---

test("story create normalizes epic_id to parent_id", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["story", "create", "--set", "title=My Story", "--set", "epic_id=e-1"]);

  const post = client.calls.find((c) => c.method === "POST");
  assert.ok(post);
  const body = post.options?.body as Record<string, unknown>;
  assert.equal(body.parent_id, "e-1");
  assert.equal(Object.hasOwn(body, "epic_id"), false);
});

// --- task create: story_id normalized to parent_id ---

test("task create normalizes story_id to parent_id", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["task", "create", "--set", "title=My Task", "--set", "story_id=s-1"]);

  const post = client.calls.find((c) => c.method === "POST");
  assert.ok(post);
  const body = post.options?.body as Record<string, unknown>;
  assert.equal(body.parent_id, "s-1");
  assert.equal(Object.hasOwn(body, "story_id"), false);
});

// --- story create: conflict between epic_id and parent_id ---

test("story create errors when epic_id and parent_id both provided", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await assert.rejects(
    () =>
      run(program, [
        "story",
        "create",
        "--set",
        "title=Bad Story",
        "--set",
        "epic_id=e-1",
        "--set",
        "parent_id=p-1",
      ]),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /epic_id.*parent_id/);
      return true;
    },
  );
});

// --- story update: epic_id normalized to parent_id ---

test("story update normalizes epic_id to parent_id", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["story", "update", "--id", "wi-1", "--set", "epic_id=e-2"]);

  const patch = client.calls.find((c) => c.method === "PATCH");
  assert.ok(patch);
  const body = patch.options?.body as Record<string, unknown>;
  assert.equal(body.parent_id, "e-2");
  assert.equal(Object.hasOwn(body, "epic_id"), false);
});

// --- project create: no normalization (not a work-item resource) ---

test("project create does not normalize epic_id", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, [
    "project",
    "create",
    "--set",
    "key=TST",
    "--set",
    "name=Test",
    "--set",
    "epic_id=e-1",
  ]);

  const post = client.calls.find((c) => c.method === "POST");
  assert.ok(post);
  const body = post.options?.body as Record<string, unknown>;
  assert.equal(body.epic_id, "e-1");
  assert.equal(Object.hasOwn(body, "parent_id"), false);
});

// --- story create: parent_id passes through unchanged ---

test("story create with parent_id passes through unchanged", async () => {
  const client = new FakeApiClient();
  const program = createProgram(client);

  await run(program, ["story", "create", "--set", "title=My Story", "--set", "parent_id=p-1"]);

  const post = client.calls.find((c) => c.method === "POST");
  assert.ok(post);
  const body = post.options?.body as Record<string, unknown>;
  assert.equal(body.parent_id, "p-1");
});
