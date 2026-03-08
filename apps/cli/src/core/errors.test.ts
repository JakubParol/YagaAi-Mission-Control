import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  CliUsageError,
  TransportError,
  exitCodeForError,
  printCliError,
} from "./errors";

test("exitCodeForError maps usage/api/transport failures", () => {
  const usage = new CliUsageError("bad input");
  const api = new ApiHttpError({ message: "api failed", status: 400, apiCode: "VALIDATION_ERROR" });
  const transport = new TransportError("timeout");

  assert.equal(exitCodeForError(usage), 1);
  assert.equal(exitCodeForError(api), 2);
  assert.equal(exitCodeForError(transport), 3);
});

test("printCliError emits structured api details in table mode", () => {
  const originalError = console.error;
  const lines: string[] = [];
  console.error = (...items: unknown[]) => {
    lines.push(items.map((item) => String(item)).join(" "));
  };

  try {
    printCliError(
      new ApiHttpError({
        message: "Validation failed",
        status: 400,
        apiCode: "VALIDATION_ERROR",
        details: [{ field: "payload.run_id", message: "required" }],
      }),
      "table",
    );
  } finally {
    console.error = originalError;
  }

  const joined = lines.join("\n");
  assert.match(joined, /HTTP: 400 \(VALIDATION_ERROR\)/);
  assert.match(joined, /payload.run_id: required/);
});
