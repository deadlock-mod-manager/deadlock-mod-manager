import { describe, expect, it } from "bun:test";
import type { FeatureFlag } from "@deadlock-mods/shared";
import type { ThemeSettings } from "@/plugins/themes/custom/types";
import {
  getRemlockFeaturedModId,
  isRemlockReleaseEnabled,
  resolveActiveTheme,
} from "./theme-release";

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

describe("Remlock mod of the week", () => {
  const stringFlag = (name: string, value: string): FeatureFlag => ({
    ...releaseFlag(false),
    id: name,
    name,
    type: "string",
    value,
  });
  const until = stringFlag("remlock-featured-until", "2026-11-02");
  const before = new Date("2026-11-01T23:59:00Z");
  const after = new Date("2026-11-02T00:00:00Z");

  it("pins a mod only during the release and before the end date", () => {
    expect(getRemlockFeaturedModId([releaseFlag(true), until], before)).toBe(
      "687789",
    );
    expect(
      getRemlockFeaturedModId([releaseFlag(true), until], after),
    ).toBeUndefined();
    expect(
      getRemlockFeaturedModId([releaseFlag(false), until], before),
    ).toBeUndefined();
    expect(
      getRemlockFeaturedModId(
        [releaseFlag(true), stringFlag("remlock-featured-until", "")],
        before,
      ),
    ).toBeUndefined();
  });

  it("pins the submission from the mod id flag", () => {
    expect(
      getRemlockFeaturedModId(
        [
          releaseFlag(true),
          until,
          stringFlag("remlock-featured-mod-id", "123456"),
        ],
        before,
      ),
    ).toBe("123456");
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

  it.each(["oled", "tea", "lovelock", "arcane", "custom", "user-created"])(
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
