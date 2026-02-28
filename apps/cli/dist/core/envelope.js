"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isObject = isObject;
exports.unwrapEnvelope = unwrapEnvelope;
exports.extractApiError = extractApiError;
function isObject(value) {
    return value !== null && typeof value === "object";
}
function unwrapEnvelope(payload) {
    if (!isObject(payload)) {
        return { data: payload, meta: undefined, raw: payload };
    }
    const maybeEnvelope = payload;
    if (Object.hasOwn(maybeEnvelope, "data")) {
        return {
            data: maybeEnvelope.data,
            meta: maybeEnvelope.meta,
            raw: payload,
        };
    }
    return { data: payload, meta: undefined, raw: payload };
}
function extractApiError(payload) {
    if (!isObject(payload)) {
        return {};
    }
    const maybeError = payload.error;
    if (!isObject(maybeError)) {
        return {};
    }
    const code = typeof maybeError.code === "string" ? maybeError.code : undefined;
    const message = typeof maybeError.message === "string" ? maybeError.message : undefined;
    const details = maybeError.details;
    return { code, message, details };
}
