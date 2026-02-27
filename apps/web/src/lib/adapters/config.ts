/**
 * Configuration for the Workflow System filesystem adapter.
 * Server-only — never import this from client components.
 */
import "server-only";

const DEFAULT_PATH = "/home/kuba/.openclaw/SUPERVISOR_SYSTEM";

/**
 * Resolved absolute path to the Workflow System root.
 * Configurable via WORKFLOW_SYSTEM_PATH environment variable.
 */
export const WORKFLOW_SYSTEM_PATH =
  process.env.WORKFLOW_SYSTEM_PATH || DEFAULT_PATH;

/** Path to the STORIES directory. */
export const STORIES_PATH = `${WORKFLOW_SYSTEM_PATH}/STORIES`;
