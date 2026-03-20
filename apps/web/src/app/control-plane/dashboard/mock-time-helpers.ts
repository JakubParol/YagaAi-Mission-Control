/* ------------------------------------------------------------------ */
/*  MC-553 — Shared time helpers for mock data generation             */
/* ------------------------------------------------------------------ */

export function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

export function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}
