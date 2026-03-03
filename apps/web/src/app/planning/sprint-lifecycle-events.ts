export type SprintLifecycleOperation = "start" | "complete";

export interface SprintLifecycleEventPayload {
  projectId: string;
  backlogId: string;
  operation: SprintLifecycleOperation;
  occurredAt: number;
}

const EVENT_NAME = "planning:sprint-lifecycle";
const STORAGE_KEY = "planning:sprint-lifecycle:last";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function parsePayload(raw: string): SprintLifecycleEventPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<SprintLifecycleEventPayload>;
    if (
      typeof value.projectId !== "string" ||
      typeof value.backlogId !== "string" ||
      (value.operation !== "start" && value.operation !== "complete") ||
      typeof value.occurredAt !== "number"
    ) {
      return null;
    }
    return {
      projectId: value.projectId,
      backlogId: value.backlogId,
      operation: value.operation,
      occurredAt: value.occurredAt,
    };
  } catch {
    return null;
  }
}

export function emitSprintLifecycleChanged(
  payload: Omit<SprintLifecycleEventPayload, "occurredAt">,
): void {
  if (!isBrowser()) return;
  const normalized: SprintLifecycleEventPayload = {
    ...payload,
    occurredAt: Date.now(),
  };
  const encoded = JSON.stringify(normalized);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: normalized }));
  window.localStorage.setItem(STORAGE_KEY, encoded);
}

export function subscribeToSprintLifecycleChanged(
  callback: (payload: SprintLifecycleEventPayload) => void,
): () => void {
  if (!isBrowser()) return () => {};

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent<SprintLifecycleEventPayload>;
    if (!custom.detail) return;
    callback(custom.detail);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    const parsed = parsePayload(event.newValue);
    if (!parsed) return;
    callback(parsed);
  };

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
