/**
 * API client utility for calling the FastAPI backend.
 *
 * Uses NEXT_PUBLIC_API_URL env var on the client side and API_URL on the server side.
 * Defaults to http://localhost:8080.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:8080";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
