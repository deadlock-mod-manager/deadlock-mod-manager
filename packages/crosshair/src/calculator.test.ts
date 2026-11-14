import { describe, expect, test } from "bun:test";
import { DeadlockHeroes } from "@deadlock-mods/shared";
import { calculateGap, getIncrementValue } from "./calculator";
import { DEFAULT_CROSSHAIR_CONFIG } from "./types";

describe("crosshair gap", () => {
  test("heroes without an override use the default gap", () => {
    const config = { ...DEFAULT_CROSSHAIR_CONFIG, gap: 5 };
    const haze = { ...config, hero: DeadlockHeroes.Haze };

    expect(calculateGap(haze)).toBe(calculateGap(config));
    expect(getIncrementValue(haze)).toBe(getIncrementValue(config));
  });

  test("override heroes keep their own gap", () => {
    const config = { ...DEFAULT_CROSSHAIR_CONFIG, gap: 5 };

    expect(calculateGap({ ...config, hero: DeadlockHeroes.Abrams })).not.toBe(
      calculateGap(config),
    );
  });
});
