"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printPayload = printPayload;
const envelope_1 = require("./envelope");
function stringifyValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint") {
        return String(value);
    }
    return JSON.stringify(value);
}
function flattenRow(value) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    const row = {};
    for (const [key, fieldValue] of entries) {
        row[key] = stringifyValue(fieldValue);
    }
    return row;
}
function printPayload(payload, outputMode) {
    if (outputMode === "json") {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    const { data, meta } = (0, envelope_1.unwrapEnvelope)(payload);
    if (data === null || data === undefined) {
        console.log("OK");
    }
    else if (Array.isArray(data)) {
        const rows = data.filter(envelope_1.isObject).map(flattenRow);
        if (rows.length > 0 && rows.length === data.length) {
            console.table(rows);
        }
        else {
            console.log(JSON.stringify(data, null, 2));
        }
    }
    else if ((0, envelope_1.isObject)(data)) {
        console.table([flattenRow(data)]);
    }
    else {
        console.log(String(data));
    }
    if (meta !== undefined && meta !== null) {
        if ((0, envelope_1.isObject)(meta)) {
            console.log("meta:");
            console.table([flattenRow(meta)]);
        }
        else {
            console.log(`meta: ${stringifyValue(meta)}`);
        }
    }
}
