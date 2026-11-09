import { describe, expect, test } from "bun:test";
import modProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/mod-profile.json";
import nestedSkinProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/nested-skin-profile.json";
import oracle from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/normalized-retained.json";
import soundProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/sound-profile.json";
import { normalizeRetainedProfile } from "./normalizer-parity";

describe("GameBanana normalizer parity", () => {
  test("the API normalizer matches the retained-field oracle", () => {
    const actual = [
      normalizeRetainedProfile(modProfile, "mod"),
      normalizeRetainedProfile(nestedSkinProfile, "mod"),
      normalizeRetainedProfile(soundProfile, "sound"),
    ];

    expect(actual).toEqual(oracle);
  });

  test.each([
    ["+00033295//", "mod:33295"],
    ["9007199254740993", "mod:9007199254740993"],
    ["18446744073709551615", "mod:18446744073709551615"],
    ["18446744073709551616", "mod:49633"],
  ])("retains category IDs without rounding or overflow: %s", (id, key) => {
    const actual = normalizeRetainedProfile(
      {
        ...nestedSkinProfile,
        _aRootCategory: {
          ...nestedSkinProfile._aRootCategory,
          _sProfileUrl: `https://gamebanana.com/mods/cats/${id}`,
        },
      },
      "mod",
    );
    expect(actual.categoryPath[0]?.key).toBe(key);
  });
});
