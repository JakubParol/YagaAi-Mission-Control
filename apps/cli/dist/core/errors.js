"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportError = exports.ApiHttpError = exports.CliUsageError = void 0;
exports.printCliError = printCliError;
exports.exitCodeForError = exitCodeForError;
class CliUsageError extends Error {
    constructor(message) {
        super(message);
        this.name = "CliUsageError";
    }
}
exports.CliUsageError = CliUsageError;
class ApiHttpError extends Error {
    status;
    apiCode;
    details;
    body;
    constructor(args) {
        super(args.message);
        this.name = "ApiHttpError";
        this.status = args.status;
        this.apiCode = args.apiCode;
        this.details = args.details;
        this.body = args.body;
    }
}
exports.ApiHttpError = ApiHttpError;
class TransportError extends Error {
    constructor(message) {
        super(message);
        this.name = "TransportError";
    }
}
exports.TransportError = TransportError;
function toPlainObject(error) {
    if (error instanceof ApiHttpError) {
        return {
            type: error.name,
            message: error.message,
            status: error.status,
            code: error.apiCode,
            details: error.details,
        };
    }
    if (error instanceof Error) {
        return {
            type: error.name,
            message: error.message,
        };
    }
    return {
        type: "UnknownError",
        message: String(error),
    };
}
function printCliError(error, outputMode) {
    const payload = toPlainObject(error);
    if (outputMode === "json") {
        console.error(JSON.stringify({ error: payload }, null, 2));
        return;
    }
    const message = typeof payload.message === "string" ? payload.message : "Unknown error";
    console.error(`Error: ${message}`);
    if (payload.type === "ApiHttpError") {
        const status = payload.status;
        const code = payload.code;
        if (status !== undefined || code !== undefined) {
            console.error(`HTTP: ${status ?? "?"}${code ? ` (${String(code)})` : ""}`);
        }
    }
}
function exitCodeForError(error) {
    if (error instanceof CliUsageError) {
        return 1;
    }
    if (error instanceof ApiHttpError) {
        return 2;
    }
    if (error instanceof TransportError) {
        return 3;
    }
    return 1;
}
