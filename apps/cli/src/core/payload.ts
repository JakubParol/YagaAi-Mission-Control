import { readFileSync } from "node:fs";

import { isObject } from "./envelope";
import { CliUsageError } from "./errors";
import { parseKeyValueList } from "./kv";

interface PayloadInput {
  json?: string;
  file?: string;
  sets?: string[];
  setFiles?: string[];
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Invalid JSON in ${source}: ${msg}`);
  }
}

function unescapeText(value: string): string {
  if (!value.includes("\\")) return value;
  let result = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === "n") {
        result += "\n";
        i++;
      } else if (next === "t") {
        result += "\t";
        i++;
      } else if (next === "\\") {
        result += "\\";
        i++;
      } else {
        result += value[i];
      }
    } else {
      result += value[i];
    }
  }
  return result;
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
  return unescapeText(value);
}

export function buildPayload(input: PayloadInput): Record<string, unknown> {
  const hasJson = Boolean(input.json && input.json.trim());
  const hasFile = Boolean(input.file && input.file.trim());
  const hasSets = Boolean(input.sets && input.sets.length > 0);
  const hasSetFiles = Boolean(input.setFiles && input.setFiles.length > 0);

  if (!hasJson && !hasFile && !hasSets && !hasSetFiles) {
    throw new CliUsageError("Missing payload. Provide --json, --file, --set, or --set-file.");
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

  if (hasSetFiles) {
    const pairs = parseKeyValueList(input.setFiles);
    for (const [key, filePath] of Object.entries(pairs)) {
      if (!filePath) {
        throw new CliUsageError(`--set-file ${key}: file path cannot be empty.`);
      }
      try {
        base[key] = readFileSync(filePath, "utf8");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new CliUsageError(`--set-file ${key}: cannot read '${filePath}': ${msg}`);
      }
    }
  }

  return base;
}

const LEGACY_PARENT_ALIASES: ReadonlySet<string> = new Set(["epic_id", "story_id"]);

/**
 * Detect legacy parent-link aliases (epic_id, story_id) in a work-item
 * mutation payload and normalize them to parent_id.
 *
 * Throws if multiple legacy aliases or a legacy alias + parent_id are present.
 */
export function normalizeWorkItemPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const found: string[] = [];
  for (const legacy of LEGACY_PARENT_ALIASES) {
    if (Object.hasOwn(payload, legacy)) {
      found.push(legacy);
    }
  }

  if (found.length === 0) return payload;

  if (found.length > 1) {
    throw new CliUsageError(
      `Payload contains multiple legacy parent aliases: ${found.join(", ")}. ` +
        "Use 'parent_id' only — these aliases are not supported by the API.",
    );
  }

  // found.length is exactly 1 here (0 and >1 cases handled above)
  const legacy = found[0]!;

  if (Object.hasOwn(payload, "parent_id")) {
    throw new CliUsageError(
      `Payload contains both '${legacy}' and 'parent_id'. ` +
        `Use 'parent_id' only — '${legacy}' is a legacy alias that the API ignores.`,
    );
  }

  payload.parent_id = payload[legacy];
  delete payload[legacy];

  return payload;
}
