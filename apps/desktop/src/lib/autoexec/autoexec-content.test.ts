import { describe, expect, it } from "bun:test";
import {
  hasAutoexecLaunchableContent,
  removeCondebugFromContent,
  repairI18nKeyCommentsInContent,
} from "./autoexec-content";

describe("hasAutoexecLaunchableContent", () => {
  it("returns false for empty content", () => {
    expect(hasAutoexecLaunchableContent("")).toBe(false);
  });

  it("returns false for whitespace-only content", () => {
    expect(hasAutoexecLaunchableContent(" \n\t ")).toBe(false);
  });

  it("returns true for restored managed sections", () => {
    expect(
      hasAutoexecLaunchableContent(
        "// === Deadlock Mod Manager - Crosshair Settings (DO NOT EDIT) ===\ncl_crosshaircolor 5\n// === End Crosshair Settings ===",
      ),
    ).toBe(true);
  });
});

describe("repairI18nKeyCommentsInContent", () => {
  it("replaces generated i18n key comments with english descriptions", () => {
    expect(
      repairI18nKeyCommentsInContent(
        "// settings.autoexecCommands.fpsMax.description\nfps_max 240",
      ),
    ).toBe("// Main FPS limit. 0 means unlimited.\nfps_max 240");
  });
});

describe("removeCondebugFromContent", () => {
  it("removes stale generated condebug comments", () => {
    expect(
      removeCondebugFromContent(
        "// settings.autoexecCommands.condebug.description\ncondebug",
      ),
    ).toBe("");
  });

  it("keeps user comments before stale condebug commands", () => {
    expect(
      removeCondebugFromContent("// keep this\ncondebug\nfps_max 240"),
    ).toBe("// keep this\nfps_max 240");
  });
});
