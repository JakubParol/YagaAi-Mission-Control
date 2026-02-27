/**
 * Base application error with HTTP status code.
 * All domain-specific errors should extend this class.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(400, message);
    this.name = "ValidationError";
  }
}
