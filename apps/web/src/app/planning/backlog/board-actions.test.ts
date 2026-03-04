import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoard,
  deleteBoard,
  toBoardMutationErrorMessage,
} from "./board-actions.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("maps BUSINESS_RULE_VIOLATION delete response to API message", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION", message: "Cannot delete the default backlog" },
  });

  const message = await toBoardMutationErrorMessage(response, "delete");
  assert.equal(message, "Cannot delete the default backlog");
});

test("createBoard posts backlog payload and resolves on success", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return jsonResponse(201, { data: { id: "b1" } });
  }) as typeof fetch;

  try {
    await createBoard({
      projectId: "p1",
      name: "Sprint 42",
      kind: "SPRINT",
      goal: "Ship board actions",
      startDate: "2026-03-05",
      endDate: "2026-03-12",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestUrl.endsWith("/v1/planning/backlogs"), true);
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.headers && (requestInit.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    project_id: "p1",
    name: "Sprint 42",
    kind: "SPRINT",
    goal: "Ship board actions",
    start_date: "2026-03-05",
    end_date: "2026-03-12",
  });
});

test("deleteBoard throws actionable message when board is protected", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    jsonResponse(400, {
      error: { code: "BUSINESS_RULE_VIOLATION", message: "Cannot delete the default backlog" },
    })) as typeof fetch;

  try {
    await assert.rejects(() => deleteBoard("b-default"), {
      message: "Cannot delete the default backlog",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleteBoard sends DELETE request and resolves on success", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    await deleteBoard("b-123");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestUrl.endsWith("/v1/planning/backlogs/b-123"), true);
  assert.equal(requestInit?.method, "DELETE");
});

test("falls back to create-specific guidance when business rule message is missing", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION" },
  });

  const message = await toBoardMutationErrorMessage(response, "create");
  assert.equal(message, "Board cannot be created with the provided data.");
});
