/**
 * Error handling module — public API surface.
 */

export { AppError, NotFoundError, ValidationError } from "./app-error";
export { withErrorHandler } from "./api-handler";
