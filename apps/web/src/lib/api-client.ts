/**
 * API client utility for calling the FastAPI backend.
 *
 * Server-side: uses API_URL (absolute) → defaults to http://127.0.0.1:5001
 * Client-side: uses NEXT_PUBLIC_API_URL (can be relative /api) → defaults to http://localhost:8080
 */

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    // Server-side: must be absolute
    return process.env.API_URL || "http://127.0.0.1:5001";
  }
  // Client-side: relative /api works (Next.js rewrites)
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

const API_BASE_URL = getApiBaseUrl();

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
