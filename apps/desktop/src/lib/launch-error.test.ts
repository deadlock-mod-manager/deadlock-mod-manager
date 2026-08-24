import { describe, expect, it } from "bun:test";
import { getLaunchErrorMessage } from "./launch-error";

describe("getLaunchErrorMessage", () => {
  it("hides technical game launch details", () => {
    const error = {
      kind: "gameLaunchFailed",
      message: "xdg-open exited with status 3: portal rejected request",
    };

    expect(getLaunchErrorMessage(error, "friendly message", "fallback")).toBe(
      "friendly message",
    );
  });

  it("preserves other Tauri error messages", () => {
    const error = { kind: "gameNotFound", message: "Game not found" };

    expect(getLaunchErrorMessage(error, "friendly message", "fallback")).toBe(
      "Game not found",
    );
  });

  it("uses the fallback for unrecognized errors", () => {
    expect(getLaunchErrorMessage("failure", "friendly", "fallback")).toBe(
      "fallback",
    );
  });
});
