/**
 * Re-export from shared db module for backward compatibility.
 * New code should import directly from "@/lib/db".
 */

export { getDb, closeDb, getDbStatus, DB_PATH } from "../db";
export type { DbStatus } from "../db";
