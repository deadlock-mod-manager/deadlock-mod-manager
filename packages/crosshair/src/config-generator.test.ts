import { describe, expect, test } from "bun:test";
import { generateConfigString, parseConfigString } from "./config-generator";
import { DEFAULT_CROSSHAIR_CONFIG } from "./types";

describe("crosshair console config", () => {
  test("exports the current outline command and round-trips it", () => {
    for (const pipBorder of [true, false]) {
      const config = { ...DEFAULT_CROSSHAIR_CONFIG, pipBorder };
      const commands = generateConfigString(config);
      expect(commands).toContain(
        `citadel_crosshair_pip_outline_border ${pipBorder ? 1 : 0}`,
      );
      expect(commands).not.toContain("citadel_crosshair_pip_border");
      expect(parseConfigString(commands)).toEqual(config);
    }
  });

  test("still imports legacy border commands", () => {
    expect(
      parseConfigString("citadel_crosshair_pip_border true")?.pipBorder,
    ).toBe(true);
  });

  test("importing colors leaves the defaults unchanged", () => {
    const original = { ...DEFAULT_CROSSHAIR_CONFIG.color };
    parseConfigString("citadel_crosshair_color_r 17");
    expect(DEFAULT_CROSSHAIR_CONFIG.color).toEqual(original);
  });
});
