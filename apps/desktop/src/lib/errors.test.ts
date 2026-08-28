import { describe, expect, it } from "bun:test";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("preserves the message from a structured Tauri error", () => {
    const error = {
      kind: "gameConfigParse",
      matchSyncKind: null,
      message: "The restored game configuration needs to be enabled again.",
    };

    expect(getErrorMessage(error)).toBe(error.message);
  });

  it("does not stringify an unrecognized object as object Object", () => {
    expect(getErrorMessage({ kind: "gameConfigParse" })).toBe(
      "An unexpected error occurred",
    );
  });
});
