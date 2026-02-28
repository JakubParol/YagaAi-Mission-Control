"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPayload = buildPayload;
const node_fs_1 = require("node:fs");
const errors_1 = require("./errors");
const kv_1 = require("./kv");
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseJson(raw, source) {
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new errors_1.CliUsageError(`Invalid JSON in ${source}: ${msg}`);
    }
}
function coerceValue(raw) {
    const value = raw.trim();
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    if (value === "null")
        return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) {
        const num = Number(value);
        if (Number.isFinite(num)) {
            return num;
        }
    }
    if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
        return parseJson(value, "--set value");
    }
    return value;
}
function buildPayload(input) {
    const hasJson = Boolean(input.json && input.json.trim());
    const hasFile = Boolean(input.file && input.file.trim());
    const hasSets = Boolean(input.sets && input.sets.length > 0);
    if (!hasJson && !hasFile && !hasSets) {
        throw new errors_1.CliUsageError("Missing payload. Provide --json, --file, or at least one --set field=value.");
    }
    if (hasJson && hasFile) {
        throw new errors_1.CliUsageError("Use either --json or --file, not both.");
    }
    let base = {};
    if (hasJson) {
        const parsed = parseJson(input.json, "--json");
        if (!isRecord(parsed)) {
            throw new errors_1.CliUsageError("--json payload must be a JSON object.");
        }
        base = { ...parsed };
    }
    if (hasFile) {
        const path = input.file.trim();
        const content = (0, node_fs_1.readFileSync)(path, "utf8");
        const parsed = parseJson(content, path);
        if (!isRecord(parsed)) {
            throw new errors_1.CliUsageError("JSON file payload must contain an object.");
        }
        base = { ...parsed };
    }
    if (hasSets) {
        const pairs = (0, kv_1.parseKeyValueList)(input.sets);
        for (const [key, raw] of Object.entries(pairs)) {
            base[key] = coerceValue(raw);
        }
    }
    return base;
}
