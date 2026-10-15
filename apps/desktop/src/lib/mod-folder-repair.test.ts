import { describe, expect, it } from "bun:test";
import { repairManifestEntries } from "./mod-folder-repair";
import { placeholderModFromManifest } from "./store/utils/manifest-install-state";
import { createProfileId, type ModProfile } from "@/types/profiles";

const profile = (): ModProfile => ({
  id: createProfileId("profile-test"),
  name: "Test",
  folderName: "profile_test",
  isDefault: false,
  createdAt: new Date(0),
  enabledMods: {},
  mods: [
    placeholderModFromManifest(
      "enabled",
      {
        enabled: true,
        shard: 2,
        currentVpks: ["pak01_dir.vpk"],
        disabledVpks: [],
        originalVpkNames: [],
        order: 4,
      },
      ["addons2/pak01_dir.vpk"],
    ),
    placeholderModFromManifest(
      "local-disabled",
      {
        enabled: false,
        shard: 1,
        currentVpks: [],
        disabledVpks: ["local-disabled_skin.vpk"],
        originalVpkNames: [],
      },
      [],
    ),
  ],
});

describe("repairManifestEntries", () => {
  it("preserves installed locators and order so the backend can attribute disk files", () => {
    const result = repairManifestEntries(profile());
    expect(result[0]).toMatchObject({
      modId: "enabled",
      currentVpks: ["addons2/pak01_dir.vpk"],
      order: 4,
    });
  });

  it("includes disabled local imports even without installed VPKs", () => {
    expect(repairManifestEntries(profile())[1]).toMatchObject({
      modId: "local-disabled",
      enabled: false,
      currentVpks: [],
      disabledVpks: [],
    });
  });

  it("includes original names from the installed file tree without mutating the store", () => {
    const value = profile();
    value.mods[0].installedFileTree = {
      files: [
        {
          name: "skin.vpk",
          path: "skin.vpk",
          size: 10,
          is_selected: true,
          archive_name: "skin.zip",
        },
      ],
      total_files: 1,
      has_multiple_files: false,
    };
    const before = structuredClone(value);
    expect(repairManifestEntries(value)[0].originalVpkNames).toEqual([
      "skin.vpk",
    ]);
    expect(value).toEqual(before);
  });
});
