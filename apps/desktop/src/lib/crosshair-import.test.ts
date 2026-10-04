import { expect, test } from "bun:test";
import { parseCitadelCrosshairFormat } from "./crosshair-import";

test("imports current and legacy crosshair outline settings", () => {
  for (const [command, expected] of [
    ["citadel_crosshair_pip_outline_border 1", true],
    ["citadel_crosshair_pip_outline_border 0", false],
    ["citadel_crosshair_pip_border true", true],
  ] as const) {
    expect(parseCitadelCrosshairFormat(command).config?.pipBorder).toBe(
      expected,
    );
  }
});
