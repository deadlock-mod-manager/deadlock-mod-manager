export enum GenericErrorCode {
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export abstract class BaseError extends Error {
  abstract readonly code: GenericErrorCode;
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = (this.constructor as unknown as { name: string }).name;
    this.originalError = originalError;

    if (originalError instanceof Error) {
      this.stack = `${this.stack}\n${originalError.stack}`;
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
    super('Unknown error', originalError);
  }
}
