import { describe, expect, it } from "bun:test";
import { formatUserError } from "@/lib/format-error";
import { HttpError } from "@/lib/http-error";

describe("formatUserError", () => {
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

  it("says which part of gameinfo.gi could not be parsed", () => {
    const formatted = formatUserError(
      new Error(
        "Failed to parse game configuration: Expected value at line 8, column 3",
      ),
    );

    expect(formatted.category).toBe("game-config");
    expect(formatted.description).toContain("line 8, column 3");
  });
});
