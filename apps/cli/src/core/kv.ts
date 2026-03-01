import { CliUsageError } from "./errors";

export function collectOption(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

export function parseKeyValue(raw: string): { key: string; value: string } {
  const idx = raw.indexOf("=");
  if (idx <= 0) {
    throw new CliUsageError(
      `Invalid expression '${raw}'. Expected format: field=value`,
    );
  }

  const key = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();

  if (!key) {
    throw new CliUsageError(`Invalid expression '${raw}'. Field name cannot be empty.`);
  }

  return { key, value };
}

export function parseKeyValueList(values: string[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of values ?? []) {
    const { key, value } = parseKeyValue(raw);
    const previous = result[key];
    if (previous !== undefined && previous !== value) {
      throw new CliUsageError(
        `Conflicting values for '${key}': '${previous}' and '${value}'.`,
      );
    }
    result[key] = value;
  }
  return result;
}

export function parseIntegerOption(raw: string, label: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new CliUsageError(`${label} must be an integer. Received: '${raw}'.`);
  }
  return parsed;
}
