import type { ModFolderRepairReport } from "@/types/generated/ModFolderRepairReport";
import type { ModProfile, SeedManifestEntry } from "@/types/profiles";

export const repairManifestEntries = (
  profile: ModProfile,
): SeedManifestEntry[] =>
  profile.mods.map((mod) => ({
    modId: mod.remoteId,
    enabled: (mod.installedVpks?.length ?? 0) > 0,
    shard: 1,
    currentVpks: mod.installedVpks ?? [],
    disabledVpks: [],
    originalVpkNames:
      mod.installedFileTree?.files.map((file) => file.name) ?? [],
    order: mod.installOrder ?? null,
  }));

type RepairDeps = {
  getActiveProfile: () => ModProfile | undefined;
  repair: (args: {
    profileFolder: ModProfile["folderName"];
    entries: SeedManifestEntry[];
    dryRun: boolean;
  }) => Promise<ModFolderRepairReport>;
  restoreModsFromManifest: () => Promise<string[]>;
  syncProfileEnabledMods: (profileId: ModProfile["id"]) => Promise<void>;
};

export const repairModFolder = async (
  dryRun: boolean,
  deps: RepairDeps,
): Promise<ModFolderRepairReport | null> => {
  const profile = deps.getActiveProfile();
  if (!profile) return null;
  const result = await deps.repair({
    profileFolder: profile.folderName,
    entries: repairManifestEntries(profile),
    dryRun,
  });
  if (!dryRun) {
    await deps.restoreModsFromManifest();
    await deps.syncProfileEnabledMods(profile.id);
  }
  return result;
};
