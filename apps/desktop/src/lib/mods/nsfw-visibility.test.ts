import { describe, expect, it } from "bun:test";
import { filterHiddenNSFWItems, shouldBlurNSFWItem } from "./nsfw-visibility";

describe("filterHiddenNSFWItems", () => {
  const mods = [
    { name: "NSFW mod A", isNSFW: true },
    { name: "NSFW mod B", isNSFW: true },
    { name: "SFW mod", isNSFW: false },
  ];

  it("removes NSFW items when hiding is enabled", () => {
    expect(filterHiddenNSFWItems(mods, true)).toEqual([mods[2]]);
  });

  it("preserves the original list when hiding is disabled", () => {
    expect(filterHiddenNSFWItems(mods, false)).toBe(mods);
  });
});

describe("shouldBlurNSFWItem", () => {
  it("blurs NSFW items by default, including hidden items that leak into the UI", () => {
    expect(
      shouldBlurNSFWItem({
        isNSFW: true,
        isVisibleOverride: undefined,
        rememberOverrides: true,
      }),
    ).toBe(true);
  });

  it("honors a show override", () => {
    expect(
      shouldBlurNSFWItem({
        isNSFW: true,
        isVisibleOverride: true,
        rememberOverrides: true,
      }),
    ).toBe(false);
  });

  it("honors a hide override", () => {
    expect(
      shouldBlurNSFWItem({
        isNSFW: true,
        isVisibleOverride: false,
        rememberOverrides: true,
      }),
    ).toBe(true);
  });

  it("ignores stored overrides when remembering per-item choices is disabled", () => {
    expect(
      shouldBlurNSFWItem({
        isNSFW: true,
        isVisibleOverride: true,
        rememberOverrides: false,
      }),
    ).toBe(true);
  });

  it("does not blur SFW items", () => {
    expect(
      shouldBlurNSFWItem({
        isNSFW: false,
        isVisibleOverride: undefined,
        rememberOverrides: true,
      }),
    ).toBe(false);
  });
});
