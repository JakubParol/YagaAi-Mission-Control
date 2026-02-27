/**
 * Configuration for the SUPERVISOR_SYSTEM filesystem adapter.
 * Server-only — never import this from client components.
 */
import "server-only";

const DEFAULT_PATH = "/home/kuba/.openclaw/SUPERVISOR_SYSTEM";

/**
 * Resolved absolute path to the SUPERVISOR_SYSTEM root.
 * Configurable via SUPERVISOR_SYSTEM_PATH environment variable.
 */
export const SUPERVISOR_SYSTEM_PATH =
  process.env.SUPERVISOR_SYSTEM_PATH || DEFAULT_PATH;

/** Path to the STORIES directory. */
export const STORIES_PATH = `${SUPERVISOR_SYSTEM_PATH}/STORIES`;
