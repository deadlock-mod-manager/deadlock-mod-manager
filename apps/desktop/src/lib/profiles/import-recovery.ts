import {
  getOrderedSharedProfileMods,
  type SharedProfile,
} from "@deadlock-mods/shared";
import type { ModProfile } from "@/types/profiles";

const getExpectedImportedRemoteIds = (sharedProfile: SharedProfile): string[] =>
  getOrderedSharedProfileMods(sharedProfile).map((mod) => mod.remoteId);

export const getImportedProfileExpectedRemoteIds = (
  profile: Pick<ModProfile, "importMetadata">,
): string[] => {
  if (!profile.importMetadata) {
    return [];
  }

  return getExpectedImportedRemoteIds(profile.importMetadata.sharedProfile);
};

export const getImportedProfileMissingRemoteIds = (
  profile: Pick<ModProfile, "importMetadata" | "mods">,
): string[] => {
  if (!profile.importMetadata) {
    return [];
  }

  const importedModsByRemoteId = new Map(
    profile.mods.map((mod) => [mod.remoteId, mod]),
  );

  return getExpectedImportedRemoteIds(
    profile.importMetadata.sharedProfile,
  ).filter((remoteId) => {
    const importedMod = importedModsByRemoteId.get(remoteId);

    return !importedMod || (importedMod.installedVpks?.length ?? 0) === 0;
  });
};

export const buildImportedProfileRetryPayload = (
  profile: Pick<ModProfile, "importMetadata" | "mods">,
): SharedProfile | null => {
  if (!profile.importMetadata) {
    return null;
  }

  const missingRemoteIds = getImportedProfileMissingRemoteIds(profile);
  if (missingRemoteIds.length === 0) {
    return null;
  }

  const missingRemoteIdSet = new Set(missingRemoteIds);
  const sharedProfile = profile.importMetadata.sharedProfile;
  const missingMods = getOrderedSharedProfileMods(sharedProfile).filter((mod) =>
    missingRemoteIdSet.has(mod.remoteId),
  );

  if (sharedProfile.version === "2") {
    return {
      version: "2",
      payload: {
        mods: missingMods,
        loadOrder: missingMods.map((mod) => mod.remoteId),
      },
    };
  }

  return {
    version: "1",
    payload: {
      mods: missingMods,
    },
  };
};
