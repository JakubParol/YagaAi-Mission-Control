"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRuntimeConfig = resolveRuntimeConfig;
exports.detectOutputModeFromArgv = detectOutputModeFromArgv;
const node_process_1 = __importDefault(require("node:process"));
const DEFAULT_API_BASE = "http://127.0.0.1:8080";
const DEFAULT_OUTPUT = "table";
const DEFAULT_TIMEOUT_SECONDS = 30;
function normalizeApiBase(url) {
    return url.trim().replace(/\/+$/, "");
}
function parseOutputMode(value) {
    const raw = (value ?? "").trim().toLowerCase();
    if (!raw) {
        return DEFAULT_OUTPUT;
    }
    if (raw === "table" || raw === "json") {
        return raw;
    }
    throw new Error(`Invalid output mode '${value}'. Expected: table or json.`);
}
function parseTimeoutSeconds(value) {
    if (value === undefined || value === "") {
        return DEFAULT_TIMEOUT_SECONDS;
    }
    const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid timeout value '${value}'. It must be a positive integer.`);
    }
    return parsed;
}
function resolveRuntimeConfig(cli = {}) {
    const apiBaseUrl = normalizeApiBase(cli.apiBase ?? node_process_1.default.env.MC_API_BASE_URL ?? DEFAULT_API_BASE);
    const actorId = cli.actorId ?? node_process_1.default.env.MC_ACTOR_ID;
    const actorType = cli.actorType ?? node_process_1.default.env.MC_ACTOR_TYPE;
    const output = parseOutputMode(cli.output ?? node_process_1.default.env.MC_OUTPUT);
    const timeoutSeconds = parseTimeoutSeconds(cli.timeoutSeconds ?? node_process_1.default.env.MC_TIMEOUT_SECONDS);
    return {
        apiBaseUrl,
        actorId: actorId && actorId.trim() ? actorId.trim() : undefined,
        actorType: actorType && actorType.trim() ? actorType.trim() : undefined,
        output,
        timeoutMs: timeoutSeconds * 1000,
    };
}
function detectOutputModeFromArgv(argv) {
    const inline = argv.find((part) => part.startsWith("--output="));
    if (inline) {
        return parseOutputMode(inline.split("=", 2)[1]);
    }
    const idx = argv.findIndex((part) => part === "--output");
    if (idx >= 0 && idx + 1 < argv.length) {
        return parseOutputMode(argv[idx + 1]);
    }
    return parseOutputMode(node_process_1.default.env.MC_OUTPUT);
}
