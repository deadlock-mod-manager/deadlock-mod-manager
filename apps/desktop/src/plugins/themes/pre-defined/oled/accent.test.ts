import { describe, expect, it } from "bun:test";
import { DEFAULT_OLED_ACCENT, getOledAccentVariables } from "./accent";

describe("OLED accent", () => {
  it("uses light button text for a dark accent and dark text for a bright accent", () => {
    expect(getOledAccentVariables("#000080")["--oled-accent-foreground"]).toBe(
      "0 0% 100%",
    );
    expect(getOledAccentVariables("#ffff00")["--oled-accent-foreground"]).toBe(
      "0 0% 0%",
    );
  });

  it("keeps dark accents readable for sidebar labels and focus rings", () => {
    const vars = getOledAccentVariables("#000080");
    expect(vars["--oled-accent"]).toBe("240 100% 25%");
    expect(vars["--oled-highlight"]).toBe("240 100% 65%");
  });

  it("falls back to gold for invalid saved colors", () => {
    expect(getOledAccentVariables("invalid")).toEqual(
      getOledAccentVariables(DEFAULT_OLED_ACCENT),
    );
  });

  it("accepts shorthand colors", () => {
    expect(getOledAccentVariables("#abc")).toEqual(
      getOledAccentVariables("#aabbcc"),
    );
  });
});
