import { describe, expect, it } from "bun:test";
import { formatUserError } from "@/lib/format-error";
import { HttpError } from "@/lib/http-error";

describe("formatUserError", () => {
  it("keeps actionable gameinfo parse details for native and wrapped errors", () => {
    const message =
      "Failed to parse game configuration: Expected value at line 7, column 3";
    for (const error of [
      new Error(message),
      { kind: "gameConfigParse", message },
    ]) {
      const formatted = formatUserError(error);
      expect(formatted.category).toBe("game-config");
      expect(formatted.description).toBe(message);
    }
  });
  it("explains a block from the running game", () => {
    const formatted = formatUserError({
      kind: "gameRunning",
      message: "Game is running",
    });

    expect(formatted.category).toBe("game-running");
    expect(formatted.title).toBe("Close Deadlock first");
    expect(formatted.description).toContain("Settings");
  });

  it("still classifies network failures", () => {
    expect(formatUserError(new HttpError("backend", 0, "/mods")).category).toBe(
      "connection",
    );
    expect(
      formatUserError(new HttpError("backend", 503, "/mods")).category,
    ).toBe("server");
  });

  it("preserves a Tauri command's reason", () => {
    expect(
      formatUserError({
        kind: "backupCreationFailed",
        message: "Backup disk full",
      }).description,
    ).toBe("Backup disk full");
  });
});
