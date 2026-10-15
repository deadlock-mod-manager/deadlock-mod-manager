import { describe, expect, it, mock } from "bun:test";
import type { ModFolderRepairReport } from "@/types/generated/ModFolderRepairReport";
import { repairManifestEntries, repairModFolder } from "./mod-folder-repair";
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

const report: ModFolderRepairReport = {
  applied: false,
  untrackedFiles: ["stray.vpk"],
  manifestStatus: "healthy",
  corruptManifestBackup: null,
  staging: [],
  quarantinedStaging: [],
  backupName: null,
  backupPath: null,
};

const repairDeps = (activeProfile: ModProfile | undefined) => {
  const calls: string[] = [];
  const repair = mock(async () => {
    calls.push("repair");
    return report;
  });
  return {
    calls,
    repair,
    deps: {
      getActiveProfile: () => activeProfile,
      repair,
      restoreModsFromManifest: async () => {
        calls.push("restore");
        return [];
      },
      syncProfileEnabledMods: async (id: string) => {
        calls.push(`sync:${id}`);
      },
    },
  };
};

describe("repairModFolder", () => {
  it("previews without refreshing the library", async () => {
    const { calls, repair, deps } = repairDeps(profile());
    expect(await repairModFolder(true, deps)).toBe(report);
    expect(repair).toHaveBeenCalledWith({
      profileFolder: "profile_test",
      entries: repairManifestEntries(profile()),
      dryRun: true,
    });
    expect(calls).toEqual(["repair"]);
  });

  it("refreshes manifest state before syncing enabled mods after applying", async () => {
    const { calls, deps } = repairDeps(profile());
    await repairModFolder(false, deps);
    expect(calls).toEqual(["repair", "restore", "sync:profile-test"]);
  });

  it("leaves the library alone when the repair command fails", async () => {
    const { calls, deps } = repairDeps(profile());
    deps.repair.mockImplementation(async () => {
      calls.push("repair");
      throw new Error("Game is running");
    });
    await expect(repairModFolder(false, deps)).rejects.toThrow(
      "Game is running",
    );
    expect(calls).toEqual(["repair"]);
  });

  it("does nothing when there is no active profile", async () => {
    const { calls, deps } = repairDeps(undefined);
    expect(await repairModFolder(false, deps)).toBeNull();
    expect(calls).toEqual([]);
  });
});
