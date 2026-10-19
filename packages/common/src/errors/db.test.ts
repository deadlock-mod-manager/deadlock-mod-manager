import { describe, expect, it } from "bun:test";
import {
  DatabaseAuthError,
  DatabaseConnectionError,
  DatabaseTimeoutError,
  mapDrizzleError,
  QuerySyntaxError,
  UniqueConstraintError,
} from "./db";
import { UnknownError } from "./generic";

describe("mapDrizzleError", () => {
  it.each([
    { code: "23505", expected: UniqueConstraintError },
    { code: "42P01", expected: QuerySyntaxError },
    { code: "28P01", expected: DatabaseAuthError },
    { code: "08006", expected: DatabaseConnectionError },
    { code: "ECONNREFUSED", expected: DatabaseConnectionError },
    { code: "ECONNRESET", expected: DatabaseConnectionError },
    { code: "ENOTFOUND", expected: DatabaseConnectionError },
    { code: "ETIMEDOUT", expected: DatabaseTimeoutError },
  ])("maps $code through query wrappers", ({ code, expected }) => {
    const cause = Object.assign(new Error("driver failure"), { code });
    const error = new Error("Failed query: insert into feature_flags", {
      cause: new Error("query wrapper", { cause }),
    });
    const result = mapDrizzleError(error);
    expect(result).toBeInstanceOf(expected);
    expect(result.message).toBe(cause.message);
  });

  it("keeps direct PostgreSQL errors working", () => {
    const error = Object.assign(new Error("duplicate flag"), { code: "23505" });
    expect(mapDrizzleError(error)).toBeInstanceOf(UniqueConstraintError);
  });

  it("preserves domain errors", () => {
    const error = new DatabaseConnectionError("database offline");
    expect(mapDrizzleError(error)).toBe(error);
    expect(mapDrizzleError(new Error("query failed", { cause: error }))).toBe(
      error,
    );
  });

  it("retains the underlying error when its code is unrecognized", () => {
    const cause = new Error("driver failure");
    const result = mapDrizzleError(new Error("Failed query", { cause }));
    expect(result).toBeInstanceOf(UnknownError);
    expect(result.originalError).toBe(cause);
  });

  it("handles cyclic causes without looping", () => {
    const error = new Error("query failed");
    error.cause = error;
    expect(mapDrizzleError(error)).toBeInstanceOf(UnknownError);
  });
});
