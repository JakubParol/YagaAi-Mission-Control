import assert from "node:assert/strict";
import test from "node:test";

import { deleteStory, toStoryDeleteErrorMessage } from "./story-actions.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("toStoryDeleteErrorMessage maps NOT_FOUND to actionable copy", async () => {
  const response = jsonResponse(404, {
    error: { code: "NOT_FOUND" },
  });

  const message = await toStoryDeleteErrorMessage(response);
  assert.equal(message, "Story was not found. Refresh and try again.");
});

test("toStoryDeleteErrorMessage falls back to API business rule message", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION", message: "Story cannot be deleted in this state" },
  });

  const message = await toStoryDeleteErrorMessage(response);
  assert.equal(message, "Story cannot be deleted in this state");
});

test("deleteStory issues DELETE request and resolves on 204", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    await deleteStory("story-1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestUrl.endsWith("/v1/planning/work-items/story-1"), true);
  assert.equal(requestInit?.method, "DELETE");
});

test("deleteStory throws mapped message when API returns validation error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    jsonResponse(400, {
      error: { code: "VALIDATION_ERROR", message: "Story delete payload is invalid" },
    })) as typeof fetch;

  try {
    await assert.rejects(() => deleteStory("story-2"), {
      message: "Story delete payload is invalid",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
