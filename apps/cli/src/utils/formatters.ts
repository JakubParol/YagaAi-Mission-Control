import Table from "cli-table3";
import chalk from "chalk";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(
  headers: string[],
  rows: string[][],
): void {
  const table = new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
  for (const row of rows) {
    table.push(row);
  }
  console.log(table.toString());
}

export function formatStatus(status: string): string {
  switch (status) {
    case "TODO":
      return chalk.gray(status);
    case "IN_PROGRESS":
      return chalk.yellow(status);
    case "DONE":
      return chalk.green(status);
    case "CANCELLED":
      return chalk.red(status);
    case "ACTIVE":
      return chalk.green(status);
    case "ARCHIVED":
      return chalk.gray(status);
    case "CODE_REVIEW":
      return chalk.blue(status);
    default:
      return status;
  }
}

export function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
