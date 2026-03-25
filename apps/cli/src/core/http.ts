import type { RuntimeConfig } from "./config";
import { ApiHttpError, TransportError } from "./errors";
import { extractApiError } from "./envelope";

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

function toQueryString(
  query: Record<string, string | number | boolean | null | undefined> | undefined,
): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      params.append(key, "null");
      continue;
    }
    params.append(key, String(value));
  }

  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ApiClient {
  private readonly cfg: RuntimeConfig;

  constructor(cfg: RuntimeConfig) {
    this.cfg = cfg;
  }

  async get(path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request("GET", path, options);
  }

  async post(path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request("POST", path, options);
  }

  async patch(path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request("PATCH", path, options);
  }

  async delete(path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request("DELETE", path, options);
  }

  private async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: RequestOptions,
  ): Promise<unknown> {
    const url = `${this.cfg.apiBaseUrl}${path}${toQueryString(options.query)}`;

    const headers = new Headers();
    headers.set("Accept", "application/json");

    if (this.cfg.actorId) {
      headers.set("X-Actor-Id", this.cfg.actorId);
    }
    if (this.cfg.actorType) {
      headers.set("X-Actor-Type", this.cfg.actorType);
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const payload = await parseBody(response);

      if (!response.ok) {
        const apiErr = extractApiError(payload);
        const message =
          apiErr.message ??
          (typeof payload === "string"
            ? payload
            : `${method} ${path} failed with status ${response.status}`);

        throw new ApiHttpError({
          message,
          status: response.status,
          apiCode: apiErr.code,
          details: apiErr.details,
          body: payload,
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof ApiHttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TransportError(`Request timed out after ${this.cfg.timeoutMs}ms`);
      }
      if (error instanceof Error) {
        throw new TransportError(error.message);
      }
      throw new TransportError(String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}
