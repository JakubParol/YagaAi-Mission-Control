"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const errors_1 = require("./errors");
const envelope_1 = require("./envelope");
function toQueryString(query) {
    if (!query) {
        return "";
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined) {
            continue;
        }
        if (value === null) {
            params.append(key, "null");
            continue;
        }
        params.append(key, String(value));
    }
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
}
async function parseBody(response) {
    if (response.status === 204) {
        return null;
    }
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
class ApiClient {
    cfg;
    constructor(cfg) {
        this.cfg = cfg;
    }
    async get(path, options = {}) {
        return this.request("GET", path, options);
    }
    async post(path, options = {}) {
        return this.request("POST", path, options);
    }
    async patch(path, options = {}) {
        return this.request("PATCH", path, options);
    }
    async delete(path, options = {}) {
        return this.request("DELETE", path, options);
    }
    async request(method, path, options) {
        const url = `${this.cfg.apiBaseUrl}${path}${toQueryString(options.query)}`;
        const headers = new Headers();
        headers.set("Accept", "application/json");
        if (this.cfg.actorId) {
            headers.set("X-Actor-Id", this.cfg.actorId);
        }
        if (this.cfg.actorType) {
            headers.set("X-Actor-Type", this.cfg.actorType);
        }
        let body;
        if (options.body !== undefined) {
            headers.set("Content-Type", "application/json");
            body = JSON.stringify(options.body);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body,
                signal: controller.signal,
            });
            const payload = await parseBody(response);
            if (!response.ok) {
                const apiErr = (0, envelope_1.extractApiError)(payload);
                const message = apiErr.message ??
                    (typeof payload === "string"
                        ? payload
                        : `${method} ${path} failed with status ${response.status}`);
                throw new errors_1.ApiHttpError({
                    message,
                    status: response.status,
                    apiCode: apiErr.code,
                    details: apiErr.details,
                    body: payload,
                });
            }
            return payload;
        }
        catch (error) {
            if (error instanceof errors_1.ApiHttpError) {
                throw error;
            }
            if (error instanceof Error && error.name === "AbortError") {
                throw new errors_1.TransportError(`Request timed out after ${this.cfg.timeoutMs}ms`);
            }
            if (error instanceof Error) {
                throw new errors_1.TransportError(error.message);
            }
            throw new errors_1.TransportError(String(error));
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.ApiClient = ApiClient;
