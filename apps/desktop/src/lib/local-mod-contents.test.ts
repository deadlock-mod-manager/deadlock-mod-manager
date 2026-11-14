import { describe, expect, it } from "bun:test";
import { ModCategory } from "./constants";
import { suggestCategory } from "./local-mod-contents";
import type { LocalPartContents } from "@/types/generated/LocalPartContents";

const part = (counts: Partial<LocalPartContents>): LocalPartContents => ({
  filePath: "part.vpk",
  readable: true,
  hero: null,
  reskinsHero: false,
  models: 0,
  particles: 0,
  abilitySounds: 0,
  voiceLines: 0,
  weaponSounds: 0,
  otherSounds: 0,
  hudFiles: 0,
  mapNames: [],
  ...counts,
});

describe("suggestCategory", () => {
  it("files a skin under Skins even when another part is its voice pack", () => {
    expect(
      suggestCategory([
        part({ reskinsHero: true, models: 3, hudFiles: 2 }),
        part({ voiceLines: 40 }),
      ]),
    ).toBe(ModCategory.SKINS);
  });

  it("files a sound pack under its largest kind of sound", () => {
    expect(suggestCategory([part({ voiceLines: 12, abilitySounds: 3 })])).toBe(
      ModCategory.VOICE_LINES,
    );
  });

  it("makes no guess when most sounds fit no category", () => {
    expect(suggestCategory([part({ weaponSounds: 2, otherSounds: 9 })])).toBe(
      null,
    );
  });

  it("files panorama-only parts under HUD", () => {
    expect(suggestCategory([part({ hudFiles: 30 })])).toBe(ModCategory.HUD);
  });

  it("makes no guess for files it cannot classify", () => {
    expect(suggestCategory([part({}), part({ readable: false })])).toBe(null);
  });
});
