import assert from "node:assert/strict";
import test from "node:test";

import { toSprintLifecycleErrorMessage } from "./sprint-lifecycle-actions.js";

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

  const message = await toSprintLifecycleErrorMessage(response, "start");
  assert.equal(message, "Select a single project before changing sprint status.");
});

test("maps CONFLICT to active sprint conflict guidance", async () => {
  const response = jsonResponse(409, {
    error: { code: "CONFLICT", message: "Project p1 already has active sprint b2" },
  });

  const message = await toSprintLifecycleErrorMessage(response, "start");
  assert.equal(message, "Another sprint is already active for this project.");
});

test("uses API message for BUSINESS_RULE_VIOLATION when present", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION", message: "Sprint b2 must be ACTIVE to complete" },
  });

  const message = await toSprintLifecycleErrorMessage(response, "complete");
  assert.equal(message, "Sprint b2 must be ACTIVE to complete");
});

test("falls back to operation-specific BUSINESS_RULE_VIOLATION guidance", async () => {
  const response = jsonResponse(400, {
    error: { code: "BUSINESS_RULE_VIOLATION" },
  });

  const message = await toSprintLifecycleErrorMessage(response, "complete");
  assert.equal(message, "Sprint can be completed only when all sprint stories are DONE.");
});

test("returns generic fallback when response body is not JSON", async () => {
  const response = new Response("not-json", { status: 503 });

  const message = await toSprintLifecycleErrorMessage(response, "start");
  assert.equal(message, "Failed to start sprint. HTTP 503.");
});
