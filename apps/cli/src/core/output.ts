import type { OutputMode } from "./config";
import { isObject, unwrapEnvelope } from "./envelope";

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function flattenRow(value: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const row: Record<string, string> = {};
  for (const [key, fieldValue] of entries) {
    row[key] = stringifyValue(fieldValue);
  }
  return row;
}

export function printPayload(payload: unknown, outputMode: OutputMode): void {
  if (outputMode === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const { data, meta } = unwrapEnvelope(payload);

  if (data === null || data === undefined) {
    console.log("OK");
  } else if (Array.isArray(data)) {
    const rows = data.filter(isObject).map(flattenRow);
    if (rows.length > 0 && rows.length === data.length) {
      console.table(rows);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } else if (isObject(data)) {
    console.table([flattenRow(data)]);
  } else {
    console.log(String(data));
  }

  if (meta !== undefined && meta !== null) {
    if (isObject(meta)) {
      console.log("meta:");
      console.table([flattenRow(meta)]);
    } else {
      console.log(`meta: ${stringifyValue(meta)}`);
    }
  }
}
