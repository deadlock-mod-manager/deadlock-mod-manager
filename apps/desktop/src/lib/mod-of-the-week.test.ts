import { describe, expect, it } from "bun:test";
import type { FeatureFlag } from "@deadlock-mods/shared";
import { getPinnedFeaturedModId } from "./mod-of-the-week";

const flag = (
  name: string,
  value: boolean | string,
  type: FeatureFlag["type"] = "string",
): FeatureFlag => ({
  id: name,
  name,
  description: null,
  type,
  value,
  enabled: value,
  exposed: false,
});

describe("pinned mod of the week", () => {
  const pin = [
    flag("mod-of-the-week-id", "111"),
    flag("mod-of-the-week-until", "2026-11-01T12:00:00.000Z"),
  ];
  const remlock = [
    flag("remlock-release", true, "boolean"),
    flag("remlock-featured-until", "2026-12-01"),
  ];

  it("pins the bot's mod until it expires, then falls back to Remlock", () => {
    const before = new Date("2026-11-01T11:59:00Z");
    const after = new Date("2026-11-01T12:00:00Z");
    expect(getPinnedFeaturedModId([...pin, ...remlock], before)).toBe("111");
    expect(getPinnedFeaturedModId([...pin, ...remlock], after)).toBe("687789");
    expect(getPinnedFeaturedModId(pin, after)).toBeUndefined();
  });
});
