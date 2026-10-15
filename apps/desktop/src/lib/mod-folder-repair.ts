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
