import type { OutputMode } from "./config";

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export class ApiHttpError extends Error {
  readonly status: number;
  readonly apiCode?: string;
  readonly details?: unknown;
  readonly body?: unknown;

  constructor(args: {
    message: string;
    status: number;
    apiCode?: string;
    details?: unknown;
    body?: unknown;
  }) {
    super(args.message);
    this.name = "ApiHttpError";
    this.status = args.status;
    this.apiCode = args.apiCode;
    this.details = args.details;
    this.body = args.body;
  }
}

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

function toPlainObject(error: unknown): Record<string, unknown> {
  if (error instanceof ApiHttpError) {
    return {
      type: error.name,
      message: error.message,
      status: error.status,
      code: error.apiCode,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
    };
  }

  return {
    type: "UnknownError",
    message: String(error),
  };
}

export function printCliError(error: unknown, outputMode: OutputMode): void {
  const payload = toPlainObject(error);

  if (outputMode === "json") {
    console.error(JSON.stringify({ error: payload }, null, 2));
    return;
  }

  const message = typeof payload.message === "string" ? payload.message : "Unknown error";
  console.error(`Error: ${message}`);

  if (payload.type === "ApiHttpError") {
    const status = payload.status;
    const code = payload.code;
    if (status !== undefined || code !== undefined) {
      console.error(`HTTP: ${status ?? "?"}${code ? ` (${String(code)})` : ""}`);
    }
  }
}

export function exitCodeForError(error: unknown): number {
  if (error instanceof CliUsageError) {
    return 1;
  }
  if (error instanceof ApiHttpError) {
    return 2;
  }
  if (error instanceof TransportError) {
    return 3;
  }
  return 1;
}
