export function logCliEvent(event: string, fields: Record<string, unknown> = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level: "info",
    event,
    ...fields,
  };
  console.error(JSON.stringify(payload));
}
