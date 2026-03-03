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

function formatApiDetails(details: unknown): string[] {
  if (!Array.isArray(details)) {
    return [];
  }

  const lines: string[] = [];
  for (const entry of details) {
    if (entry && typeof entry === "object") {
      const obj = entry as { field?: unknown; message?: unknown };
      const field = typeof obj.field === "string" && obj.field.trim() ? obj.field : null;
      const message =
        typeof obj.message === "string" && obj.message.trim()
          ? obj.message
          : JSON.stringify(entry);
      lines.push(field ? `${field}: ${message}` : message);
      continue;
    }
    lines.push(String(entry));
  }

  return lines;
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

    const details = formatApiDetails(payload.details);
    if (details.length > 0) {
      console.error("Details:");
      for (const detail of details) {
        console.error(`- ${detail}`);
      }
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
