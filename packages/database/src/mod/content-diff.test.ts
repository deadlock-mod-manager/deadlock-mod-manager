import { describe, expect, it } from "bun:test";
import type { Mod } from "../schema/mods";
import { modContentDiffers } from "./content-diff";

const baseMod = (): Mod =>
  ({
    id: "mod_1",
    remoteId: "123",
    name: "Test Mod",
    description: "Description",
    remoteUrl: "https://example.com/mod/123",
    category: "Skins",
    likes: 10,
    author: "Author",
    downloadable: true,
    remoteAddedAt: new Date("2024-01-01T00:00:00.000Z"),
    remoteUpdatedAt: new Date("2024-01-02T00:00:00.000Z"),
    tags: ["tag-a", "tag-b"],
    images: ["image-a"],
    hero: "Victor",
    isAudio: false,
    isMap: false,
    audioUrl: null,
    downloadCount: 100,
    isNSFW: false,
    isObsolete: false,
    isTrashed: false,
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    blacklistedBy: null,
    filesUpdatedAt: null,
    metadata: { mapName: "test-map" },
    overrides: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  }) satisfies Mod;

describe("modContentDiffers", () => {
  it("returns false when cache-relevant fields are unchanged", () => {
    const mod = baseMod();
    expect(modContentDiffers(mod, { ...mod })).toBe(false);
  });

  it("returns false when only tags order changes", () => {
    const before = baseMod();
    const after = { ...before, tags: ["tag-b", "tag-a"] };
    expect(modContentDiffers(before, after)).toBe(false);
  });

  it("returns true when metadata changes", () => {
    const before = baseMod();
    const after = {
      ...before,
      metadata: { mapName: "other-map" },
    };
    expect(modContentDiffers(before, after)).toBe(true);
  });

  it("returns true when hero changes", () => {
    const before = baseMod();
    const after = { ...before, hero: "Seven" };
    expect(modContentDiffers(before, after)).toBe(true);
  });
});
