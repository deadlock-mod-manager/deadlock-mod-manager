import type { DatabaseError } from "pg";

import { DatabaseErrorCode } from "./codes";
import { BaseError, UnknownError } from "./generic";

export class EntityNotFoundError extends BaseError {
  readonly code = DatabaseErrorCode.ENTITY_NOT_FOUND;
  constructor(entity = "Record", id = "unknown") {
    super(`${entity} with id ${id} not found`);
  }
}

export class DatabaseConnectionError extends BaseError {
  readonly code = DatabaseErrorCode.CONNECTION_ERROR;
  constructor(message = "Failed to connect to database") {
    super(message);
  }
}

export class QuerySyntaxError extends BaseError {
  readonly code = DatabaseErrorCode.QUERY_SYNTAX_ERROR;
  constructor(message = "Invalid query syntax") {
    super(message);
  }
}

export class UniqueConstraintError extends BaseError {
  readonly code = DatabaseErrorCode.UNIQUE_CONSTRAINT_ERROR;
  constructor(message = "Record with this value already exists") {
    super(message);
  }
}

export class ForeignKeyConstraintError extends BaseError {
  readonly code = DatabaseErrorCode.FOREIGN_KEY_ERROR;
  constructor(message = "Invalid reference to non-existent record") {
    super(message);
  }
}

export class TransactionError extends BaseError {
  readonly code = DatabaseErrorCode.TRANSACTION_ERROR;
  constructor(message = "Failed to complete transaction") {
    super(message);
  }
}

export class DatabaseAuthError extends BaseError {
  readonly code = DatabaseErrorCode.AUTH_ERROR;
  constructor(message = "Database authentication failed") {
    super(message);
  }
}

export class PermissionError extends BaseError {
  readonly code = DatabaseErrorCode.PERMISSION_ERROR;
  constructor(message = "Permission denied") {
    super(message);
  }
}

export class DatabaseTimeoutError extends BaseError {
  readonly code = DatabaseErrorCode.TIMEOUT_ERROR;
  constructor(message = "Operation timed out") {
    super(message);
  }
}

export class BatchOperationError extends BaseError {
  readonly code = DatabaseErrorCode.BATCH_ERROR;
  constructor(message = "Batch operation partially failed") {
    super(message);
  }
}

export class InsertError extends BaseError {
  readonly code = DatabaseErrorCode.INSERT_ERROR;
  constructor(message = "Failed to insert record") {
    super(message);
  }
}

export class UpsertError extends BaseError {
  readonly code = DatabaseErrorCode.UPSERT_ERROR;
  constructor(message = "Failed to upsert record") {
    super(message);
  }
}

export class DeleteError extends BaseError {
  readonly code = DatabaseErrorCode.DELETE_ERROR;
  constructor(message = "Failed to delete record") {
    super(message);
  }
}

export class UpdateError extends BaseError {
  readonly code = DatabaseErrorCode.UPDATE_ERROR;
  constructor(message = "Failed to update record") {
    super(message);
  }
}

export class NotNullError extends BaseError {
  readonly code = DatabaseErrorCode.NOT_NULL_ERROR;
  constructor(message = "Value cannot be null") {
    super(message);
  }
}

export const mapDrizzleError = (
  error: DatabaseError | Error | undefined | null | unknown,
): BaseError => {
  if (!error) {
    return new UnknownError("Unknown database error");
  }

  if (!(error instanceof Error)) {
    return new UnknownError("Unknown database error");
  }

  let currentError = error;
  const visited = new Set<Error>();
  while (
    !(currentError instanceof BaseError) &&
    currentError.cause instanceof Error &&
    !visited.has(currentError.cause)
  ) {
    visited.add(currentError);
    currentError = currentError.cause;
  }

  if (currentError instanceof BaseError) return currentError;

  const errMsg = currentError.message || "";
  const errCode = "code" in currentError ? currentError.code : "";

  if (errMsg.includes("no rows returned") || errMsg.includes("not found")) {
    return new EntityNotFoundError("Entity", "unknown");
  }

  switch (errCode) {
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
    case "08000":
    case "08003":
    case "08006":
    case "08001":
    case "08004":
      return new DatabaseConnectionError(errMsg);

    case "28000":
    case "28P01":
      return new DatabaseAuthError(errMsg);

    case "23505":
      return new UniqueConstraintError(errMsg);

    case "23503":
      return new ForeignKeyConstraintError(errMsg);

    case "23502":
      return new NotNullError(errMsg);

    case "42601":
    case "42P01":
    case "42703":
      return new QuerySyntaxError(errMsg);

    case "25P02":
    case "40001":
    case "40P01":
      return new TransactionError(errMsg);

    case "42501":
      return new PermissionError(errMsg);

    case "ETIMEDOUT":
    case "57014":
    case "57P01":
    case "57P02":
    case "57P03":
      return new DatabaseTimeoutError(errMsg);

    default:
      return new UnknownError(currentError);
  }
};
