interface EnvelopeLike {
  data?: unknown;
  meta?: unknown;
  error?: unknown;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function unwrapEnvelope(payload: unknown): {
  data: unknown;
  meta: unknown;
  raw: unknown;
} {
  if (!isObject(payload)) {
    return { data: payload, meta: undefined, raw: payload };
  }

  const maybeEnvelope = payload as EnvelopeLike;
  if (Object.hasOwn(maybeEnvelope, "data")) {
    return {
      data: maybeEnvelope.data,
      meta: maybeEnvelope.meta,
      raw: payload,
    };
  }

  return { data: payload, meta: undefined, raw: payload };
}

export function extractApiError(payload: unknown): {
  code?: string;
  message?: string;
  details?: unknown;
} {
  if (!isObject(payload)) {
    return {};
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (!isObject(maybeError)) {
    return {};
  }

  const code = typeof maybeError.code === "string" ? maybeError.code : undefined;
  const message = typeof maybeError.message === "string" ? maybeError.message : undefined;
  const details = maybeError.details;

  return { code, message, details };
}
