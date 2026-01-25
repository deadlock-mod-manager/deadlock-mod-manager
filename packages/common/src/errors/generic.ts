import { ApiErrorCode, type ErrorCode, GenericErrorCode } from "./codes";
export abstract class BaseError extends Error {
  abstract readonly code: ErrorCode;
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = (this.constructor as unknown as { name: string }).name;
    this.originalError = originalError;

    // Preserve original error's stack trace
    if (originalError instanceof Error && originalError?.stack) {
      this.stack = originalError.stack;
    } else if (Error.captureStackTrace) {
      // Capture stack trace at caller's location
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export abstract class GenericError extends BaseError {}

export class RuntimeError extends GenericError {
  readonly code = GenericErrorCode.RUNTIME_ERROR;

  constructor(message: string, originalError?: unknown) {
    super(`Runtime error: ${message}`, originalError);
  }
}

export class ValidationError extends GenericError {
  readonly code = GenericErrorCode.VALIDATION_ERROR;

  constructor(message: string, originalError?: unknown) {
    super(`Validation error: ${message}`, originalError);
  }
}

export class UnknownError extends GenericError {
  readonly code = GenericErrorCode.UNKNOWN_ERROR;

  constructor(originalError?: unknown) {
    super("Unknown error", originalError);
  }
}

export class UnauthorizedError extends BaseError {
  readonly code = ApiErrorCode.UNAUTHORIZED_ERROR;
  readonly status = 401;

  constructor(message = "Authentication required", originalError?: unknown) {
    super(message, originalError);
  }
}

export class MultipleErrors extends BaseError {
  readonly errors: BaseError[];
  readonly code = GenericErrorCode.MULTIPLE_ERRORS;

  constructor(
    message: string,
    errors: BaseError[],
    code = GenericErrorCode.RUNTIME_ERROR,
  ) {
    super(message, code);
    this.errors = errors;
  }

  override get stack() {
    const baseStack = super.stack || "";
    const errorStacks = this.errors.map((error) => error.stack).join("\n---\n");
    return `${baseStack}\n\nAggregated Errors:\n${errorStacks}`;
  }

  override get message() {
    const baseMessage = super.message;
    const errorMessages = this.errors.map((error) => error.message).join("; ");
    return `${baseMessage} (${errorMessages})`;
  }
}
