import { readFileSync } from "node:fs";

import { isObject } from "./envelope";
import { CliUsageError } from "./errors";
import { parseKeyValueList } from "./kv";

interface PayloadInput {
  json?: string;
  file?: string;
  sets?: string[];
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Invalid JSON in ${source}: ${msg}`);
  }
}

function coerceValue(raw: string): unknown {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  const isJsonLike =
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"));
  if (isJsonLike) {
    return parseJson(value, "--set value");
  }
  return value;
}

export function buildPayload(input: PayloadInput): Record<string, unknown> {
  const hasJson = Boolean(input.json && input.json.trim());
  const hasFile = Boolean(input.file && input.file.trim());
  const hasSets = Boolean(input.sets && input.sets.length > 0);

  if (!hasJson && !hasFile && !hasSets) {
    throw new CliUsageError("Missing payload. Provide --json, --file, or at least one --set field=value.");
  }

  if (hasJson && hasFile) {
    throw new CliUsageError("Use either --json or --file, not both.");
  }

  let base: Record<string, unknown> = {};

  if (hasJson) {
    const parsed = parseJson(input.json!, "--json");
    if (!isObject(parsed)) {
      throw new CliUsageError("--json payload must be a JSON object.");
    }
    base = { ...parsed };
  }

  if (hasFile) {
    const path = input.file!.trim();
    const content = readFileSync(path, "utf8");
    const parsed = parseJson(content, path);
    if (!isObject(parsed)) {
      throw new CliUsageError("JSON file payload must contain an object.");
    }
    base = { ...parsed };
  }

  if (hasSets) {
    const pairs = parseKeyValueList(input.sets);
    for (const [key, raw] of Object.entries(pairs)) {
      base[key] = coerceValue(raw);
    }
  }

  return base;
}
