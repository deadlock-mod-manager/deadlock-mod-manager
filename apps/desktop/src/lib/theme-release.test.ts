import { describe, expect, it } from "bun:test";
import type { FeatureFlag } from "@deadlock-mods/shared";
import type { ThemeSettings } from "@/plugins/themes/custom/types";
import { isRemlockReleaseEnabled, resolveActiveTheme } from "./theme-release";

function releaseFlag(value: boolean | string): FeatureFlag {
  return {
    id: "release",
    name: "remlock-release",
    description: null,
    type: "boolean",
    value,
    enabled: value,
    exposed: true,
  };
}

describe("Remlock release flag", () => {
  it("fails closed until the server returns a boolean true", () => {
    expect(isRemlockReleaseEnabled()).toBe(false);
    expect(isRemlockReleaseEnabled([releaseFlag(false)])).toBe(false);
    expect(isRemlockReleaseEnabled([releaseFlag("true")])).toBe(false);
    expect(isRemlockReleaseEnabled([releaseFlag(true)])).toBe(true);
  });

  it("respects the themes plugin kill switch", () => {
    expect(
      isRemlockReleaseEnabled([
        releaseFlag(true),
        { ...releaseFlag(false), id: "themes", name: "plugin-themes" },
      ]),
    ).toBe(false);
  });
});

describe("release theme selection", () => {
  const settings: ThemeSettings = { activeSection: "pre-defined" };

  it("defaults fresh and unthemed users to Remlock only during the release", () => {
    expect(resolveActiveTheme(undefined, true)).toBe("remlock");
    expect(resolveActiveTheme(settings, true)).toBe("remlock");
    expect(resolveActiveTheme(settings, false)).toBeUndefined();
    expect(settings.activeTheme).toBeUndefined();
  });

  it.each(["tea", "lovelock", "arcane", "custom", "user-created"])(
    "preserves the selected %s theme regardless of the release flag",
    (activeTheme) => {
      const selected = { ...settings, activeTheme };
      expect(resolveActiveTheme(selected, true)).toBe(activeTheme);
      expect(resolveActiveTheme(selected, false)).toBe(activeTheme);
    },
  );

  it("lets users opt out without immediately reapplying Remlock", () => {
    expect(
      resolveActiveTheme({ ...settings, releaseThemeDismissed: true }, true),
    ).toBeUndefined();
  });

  it("preserves an enabled background plugin instead of applying the default", () => {
    expect(resolveActiveTheme(settings, true, true)).toBeUndefined();
  });

  it("stops rendering an explicitly saved Remlock theme when the flag is off", () => {
    const selected = { ...settings, activeTheme: "remlock" };
    expect(resolveActiveTheme(selected, false)).toBeUndefined();
    expect(resolveActiveTheme(selected, true)).toBe("remlock");
  });
});
