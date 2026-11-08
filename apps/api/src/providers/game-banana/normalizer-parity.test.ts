import { describe, expect, test } from "bun:test";
import modProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/mod-profile.json";
import nestedSkinProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/nested-skin-profile.json";
import oracle from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/normalized-retained.json";
import soundProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/sound-profile.json";
import { normalizeRetainedProfile } from "./normalizer-parity";

// The category path drives desktop-only nested catalog filters, so the API
// never derives it; the Rust normalizer tests cover that field.
const expected = oracle.map(({ categoryPath: _categoryPath, ...rest }) => rest);

describe("GameBanana normalizer parity", () => {
  test("the API normalizer matches the retained-field oracle", () => {
    const actual = [
      normalizeRetainedProfile(modProfile, "mod"),
      normalizeRetainedProfile(nestedSkinProfile, "mod"),
      normalizeRetainedProfile(soundProfile, "sound"),
    ];

    expect(actual).toEqual(expected);
  });
});
