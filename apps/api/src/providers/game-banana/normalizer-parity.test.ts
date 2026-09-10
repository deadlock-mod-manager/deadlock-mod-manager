import { describe, expect, test } from "bun:test";
import modProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/mod-profile.json";
import expected from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/normalized-retained.json";
import soundProfile from "../../../../desktop/src-tauri/tests/fixtures/gamebanana/sound-profile.json";
import { normalizeRetainedProfile } from "./normalizer-parity";

describe("GameBanana normalizer parity", () => {
  test("the API normalizer matches the retained-field oracle", () => {
    const actual = [
      normalizeRetainedProfile(modProfile, "mod"),
      normalizeRetainedProfile(soundProfile, "sound"),
    ];

    expect(actual).toEqual(expected);
  });
});
