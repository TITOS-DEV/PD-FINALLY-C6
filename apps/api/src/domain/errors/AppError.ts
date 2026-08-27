/**
 * Base class for every error the application throws on purpose.
 *
 * The idea is simple: use cases and repositories never touch Express or
 * write `res.status(...)` — they just throw one of these. A single
 * middleware at the edge (see errorHandler.ts) knows how to turn any
 * AppError into the right HTTP response. Anything that is NOT an AppError
 * is treated as a bug and answered with a generic 500, never leaking
 * internal details to the client.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /** Machine-readable code the frontend can branch on (e.g. "INVALID_CREDENTIALS"). */
    public readonly code: string,
    /** Extra context, only ever logged server-side, never sent to the client. */
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "The request payload is invalid", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required or the credentials are invalid") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this resource") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource doesn't exist") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state") {
    super(message, 409, "CONFLICT");
  }
}
