import assert from "node:assert/strict";
import test from "node:test";

import { toSprintMembershipErrorMessage } from "./sprint-membership-actions.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("maps VALIDATION_ERROR to project selection guidance", async () => {
  const response = jsonResponse(400, {
    error: { code: "VALIDATION_ERROR", message: "Either project_id or project_key is required" },
  });

  const message = await toSprintMembershipErrorMessage(response, "add");
  assert.equal(message, "Select a single project before updating sprint membership.");
});

test("uses API message for BUSINESS_RULE_VIOLATION when present", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION", message: "Story is not in product backlog" },
  });

  const message = await toSprintMembershipErrorMessage(response, "add");
  assert.equal(message, "Story is not in product backlog");
});

test("falls back to operation-specific BUSINESS_RULE_VIOLATION message", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION" },
  });

  const message = await toSprintMembershipErrorMessage(response, "remove");
  assert.equal(message, "Only stories already in the active sprint can be removed.");
});

test("returns generic fallback when response body is not JSON", async () => {
  const response = new Response("not-json", { status: 503 });

  const message = await toSprintMembershipErrorMessage(response, "add");
  assert.equal(message, "Failed to add story to active sprint. HTTP 503.");
});
