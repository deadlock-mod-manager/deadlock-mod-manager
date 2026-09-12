import { describe, expect, test } from "bun:test";
import { HttpError, returnNullForNotFound } from "./http-error";

describe("returnNullForNotFound", () => {
  test("returns null for an HTTP 404", () => {
    const error = new HttpError("backend", 404, "/api/v2/mod-authors/missing");

    expect(returnNullForNotFound(error)).toBeNull();
  });

  test("rethrows other failures", () => {
    const error = new HttpError("backend", 500, "/api/v2/mod-authors/broken");

    expect(() => returnNullForNotFound(error)).toThrow(error);
  });
});
