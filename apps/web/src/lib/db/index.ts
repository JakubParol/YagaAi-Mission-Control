/**
 * Shared database module — public API surface.
 *
 * Provides the SQLite singleton used by all domain modules
 * (langfuse-import, planning). Centralizes connection management
 * so no module depends on another for DB access.
 */

export { getDb, closeDb, getDbStatus, DB_PATH } from "./connection";
export type { DbStatus } from "./connection";
