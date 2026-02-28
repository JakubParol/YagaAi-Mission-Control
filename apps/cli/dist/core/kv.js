"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectOption = collectOption;
exports.parseKeyValue = parseKeyValue;
exports.parseKeyValueList = parseKeyValueList;
exports.parseIntegerOption = parseIntegerOption;
const errors_1 = require("./errors");
function collectOption(value, previous = []) {
    return [...previous, value];
}
function parseKeyValue(raw) {
    const idx = raw.indexOf("=");
    if (idx <= 0) {
        throw new errors_1.CliUsageError(`Invalid expression '${raw}'. Expected format: field=value`);
    }
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (!key) {
        throw new errors_1.CliUsageError(`Invalid expression '${raw}'. Field name cannot be empty.`);
    }
    return { key, value };
}
function parseKeyValueList(values) {
    const result = {};
    for (const raw of values ?? []) {
        const { key, value } = parseKeyValue(raw);
        const previous = result[key];
        if (previous !== undefined && previous !== value) {
            throw new errors_1.CliUsageError(`Conflicting values for '${key}': '${previous}' and '${value}'.`);
        }
        result[key] = value;
    }
    return result;
}
function parseIntegerOption(raw, label) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        throw new errors_1.CliUsageError(`${label} must be an integer. Received: '${raw}'.`);
    }
    return parsed;
}
