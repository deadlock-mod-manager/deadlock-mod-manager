import { describe, expect, it } from "bun:test";
import { DEFAULT_CODING_ACCENT, getCodingAccentVariables } from "./accent";

describe("Coding accent", () => {
  it("uses light button text for a dark accent and dark text for a bright accent", () => {
    expect(
      getCodingAccentVariables("#000080")["--coding-accent-foreground"],
    ).toBe("0 0% 100%");
    expect(
      getCodingAccentVariables("#ffff00")["--coding-accent-foreground"],
    ).toBe("222 24% 7%");
  });

  it("keeps dark accents readable for sidebar labels and focus rings", () => {
    const vars = getCodingAccentVariables("#000080");
    expect(vars["--coding-accent"]).toBe("240 100% 25%");
    expect(vars["--coding-highlight"]).toBe("240 100% 62%");
  });

  it("falls back to emerald for invalid saved colors", () => {
    expect(getCodingAccentVariables("invalid")).toEqual(
      getCodingAccentVariables(DEFAULT_CODING_ACCENT),
    );
  });
});
