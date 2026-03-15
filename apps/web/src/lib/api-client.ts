/**
 * API client utility for calling the FastAPI backend.
 *
 * Server-side: uses API_URL (absolute) → defaults to http://127.0.0.1:5000
 * Client-side: uses NEXT_PUBLIC_API_URL (relative /api recommended) → defaults to /api
 */

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    // Server-side: must be absolute
    return process.env.API_URL || "http://127.0.0.1:5000";
  }
  // Client-side: use relative /api so browser never sees Docker-internal hostnames
  return process.env.NEXT_PUBLIC_API_URL || "/api";
}

const API_BASE_URL = getApiBaseUrl();

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
