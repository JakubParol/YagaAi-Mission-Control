import type { OutputMode } from "./config";
import { isObject, unwrapEnvelope } from "./envelope";
import Table from "cli-table3";

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  if (limit <= 3) {
    return value.slice(0, limit);
  }
  return `${value.slice(0, limit - 3)}...`;
}

type CellRenderMode = "wrap" | "trim";

function sanitizeCell(
  value: unknown,
  width: number,
  mode: CellRenderMode = "trim",
): string {
  const text = stringifyValue(value).replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    return "";
  }
  if (mode === "wrap") {
    return text;
  }
  return truncate(text, Math.max(1, width));
}

function contentLength(value: unknown): number {
  return stringifyValue(value).replace(/\s+/g, " ").trim().length;
}

function terminalWidth(): number {
  const columns = process.stdout.columns;
  if (typeof columns === "number" && columns > 0) {
    return columns;
  }
  return 120;
}

const KEY_PRIORITY = [
  "key",
  "id",
  "name",
  "title",
  "status",
  "priority",
  "project_id",
  "epic_id",
  "story_id",
  "task_id",
  "agent_id",
  "kind",
  "type",
  "created_at",
  "updated_at",
];

function keyRank(key: string): number {
  const index = KEY_PRIORITY.indexOf(key);
  return index >= 0 ? index : KEY_PRIORITY.length;
}

function sortedKeys(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => {
    const rankDiff = keyRank(a) - keyRank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.localeCompare(b);
  });
}

function isIdentifierKey(key: string): boolean {
  return (
    key === "id" ||
    key.endsWith("_id") ||
    key.endsWith("Id") ||
    key.endsWith("ID")
  );
}

function shouldWrapKey(key: string): boolean {
  return isIdentifierKey(key) || key === "key" || key === "name" || key === "title";
}

function maxColumnWidth(key: string): number {
  if (key === "key") {
    return 24;
  }
  if (isIdentifierKey(key)) {
    return 36;
  }
  if (key === "name" || key === "title") {
    return 36;
  }
  if (/_at$/.test(key) || key.endsWith("_date")) {
    return 24;
  }
  if (/(description|metadata|intent|objective|reason|goal)/.test(key)) {
    return 52;
  }
  return 32;
}

function minColumnWidth(key: string): number {
  if (shouldWrapKey(key)) {
    return 10;
  }
  return 8;
}

function desiredWidths(
  keys: string[],
  rows: Record<string, unknown>[],
): { desired: number[]; minimum: number[] } {
  const sample = rows.slice(0, 50);
  const desired: number[] = [];
  const minimum: number[] = [];
  for (const key of keys) {
    const maxWidth = maxColumnWidth(key);
    let natural = key.length;
    for (const row of sample) {
      const length = contentLength(row[key]);
      natural = Math.max(natural, length);
    }
    const paddedNatural = natural + 2;
    const minWidth = minColumnWidth(key);
    desired.push(clamp(paddedNatural, minWidth, maxWidth));
    minimum.push(minWidth);
  }
  return { desired, minimum };
}

function fitWidthsToTerminal(keys: string[], desired: number[], minimum: number[]): number[] {
  const width = terminalWidth();
  const borderOverhead = keys.length * 3 + 1;
  const budget = Math.max(40, width - borderOverhead);
  const result = [...desired];

  let total = result.reduce((sum, item) => sum + item, 0);
  while (total > budget) {
    let shrunk = false;
    for (let index = 0; index < result.length; index += 1) {
      const remaining = result[index] ?? 0;
      const minimumWidth = minimum[index] ?? 0;
      if (remaining > minimumWidth) {
        result[index] = remaining - 1;
        total -= 1;
        shrunk = true;
        if (total <= budget) {
          break;
        }
      }
    }
    if (!shrunk) {
      break;
    }
  }

  return result;
}

function renderObjectList(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log("(empty)");
    return;
  }

  const keys = sortedKeys(rows);
  const { desired, minimum } = desiredWidths(keys, rows);
  const colWidths = fitWidthsToTerminal(keys, desired, minimum);

  const table = new Table({
    head: keys,
    wordWrap: true,
    wrapOnWordBoundary: false,
    colWidths,
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push(
      keys.map((key, index) => {
        const width = colWidths[index] ?? 20;
        const contentWidth = Math.max(1, width - 2);
        const mode: CellRenderMode = shouldWrapKey(key) ? "wrap" : "trim";
        return sanitizeCell(row[key], contentWidth, mode);
      }),
    );
  }

  console.log(table.toString());
}

function renderObjectRecord(record: Record<string, unknown>): void {
  const keys = sortedKeys([record]);
  const totalWidth = terminalWidth();
  const keyWidth = clamp(
    keys.reduce((max, key) => Math.max(max, key.length), 0) + 2,
    12,
    30,
  );
  const valueWidth = Math.max(20, totalWidth - keyWidth - 7);

  const table = new Table({
    head: ["field", "value"],
    wordWrap: true,
    wrapOnWordBoundary: false,
    colWidths: [keyWidth, valueWidth],
    style: { head: [], border: [] },
  });

  for (const key of keys) {
    const contentWidth = Math.max(1, valueWidth - 2);
    const mode: CellRenderMode = shouldWrapKey(key) ? "wrap" : "trim";
    table.push([key, sanitizeCell(record[key], contentWidth, mode)]);
  }

  console.log(table.toString());
}

function renderMeta(meta: unknown): void {
  if (meta === undefined || meta === null) {
    return;
  }

  if (isObject(meta) && Object.keys(meta).length === 0) {
    return;
  }

  console.log("meta:");
  if (Array.isArray(meta)) {
    const objects = meta.filter(isObject);
    if (objects.length === meta.length) {
      renderObjectList(objects);
      return;
    }

    const table = new Table({
      head: ["value"],
      wordWrap: true,
      colWidths: [Math.max(20, terminalWidth() - 4)],
      style: { head: [], border: [] },
    });
    for (const value of meta) {
      table.push([sanitizeCell(value, terminalWidth() - 6)]);
    }
    console.log(table.toString());
    return;
  }

  if (isObject(meta)) {
    renderObjectRecord(meta);
    return;
  }

  console.log(stringifyValue(meta));
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
    const objectRows = data.filter(isObject);
    if (objectRows.length > 0 && objectRows.length === data.length) {
      renderObjectList(objectRows);
    } else {
      const table = new Table({
        head: ["value"],
        wordWrap: true,
        colWidths: [Math.max(20, terminalWidth() - 4)],
        style: { head: [], border: [] },
      });
      for (const value of data) {
        table.push([sanitizeCell(value, terminalWidth() - 6)]);
      }
      console.log(table.toString());
    }
  } else if (isObject(data)) {
    renderObjectRecord(data);
  } else {
    console.log(String(data));
  }

  renderMeta(meta);
}
