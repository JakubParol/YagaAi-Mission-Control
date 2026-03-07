import assert from "node:assert/strict";
import test from "node:test";

import {
  toActionHttpErrorMessage,
  toBulkResultErrorMessage,
} from "./page.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("toActionHttpErrorMessage maps auth and validation errors", async () => {
  const unauthorized = await toActionHttpErrorMessage(
    jsonResponse(401, { error: { code: "UNAUTHORIZED" } }),
    "status",
  );
  assert.equal(unauthorized, "Authentication is required to perform this action.");

  const forbidden = await toActionHttpErrorMessage(
    jsonResponse(403, { error: { code: "FORBIDDEN" } }),
    "add-to-sprint",
  );
  assert.equal(forbidden, "You do not have permission to perform this action.");

  const invalid = await toActionHttpErrorMessage(
    jsonResponse(422, { error: { code: "UNPROCESSABLE_ENTITY" } }),
    "status",
  );
  assert.equal(invalid, "Status update request is invalid. Refresh and try again.");

  const projectValidation = await toActionHttpErrorMessage(
    jsonResponse(400, { error: { code: "VALIDATION_ERROR" } }),
    "add-to-sprint",
  );
  assert.equal(projectValidation, "Select a single project before adding a story to sprint.");
});

test("toActionHttpErrorMessage falls back to API message and status fallback", async () => {
  const apiMessage = await toActionHttpErrorMessage(
    jsonResponse(400, { error: { code: "BUSINESS_RULE_VIOLATION", message: "Story transition not allowed" } }),
    "status",
  );
  assert.equal(apiMessage, "Story transition not allowed");

  const fallback = await toActionHttpErrorMessage(new Response("no-json", { status: 503 }), "add-to-sprint");
  assert.equal(fallback, "Failed to add story to sprint. HTTP 503.");
});

test("toBulkResultErrorMessage maps per-record errors", () => {
  assert.equal(
    toBulkResultErrorMessage({ error_code: "NO_ACTIVE_SPRINT" }, "add-to-sprint"),
    "No active sprint is available for this project.",
  );

  assert.equal(
    toBulkResultErrorMessage({ error_code: "BUSINESS_RULE_VIOLATION" }, "status"),
    "Story status cannot be changed in the current state.",
  );

  assert.equal(
    toBulkResultErrorMessage({ error_message: "Forbidden by policy" }, "status"),
    "Forbidden by policy",
  );
});
