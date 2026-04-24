import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import type { AvailableImportedMod } from "@/lib/profiles/types";
import type { LocalMod } from "@/types/mods";

export const sortModsByInstallOrder = (mods: LocalMod[]): LocalMod[] =>
  [...mods].sort(
    (left, right) =>
      (left.installOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.installOrder ?? Number.MAX_SAFE_INTEGER),
  );

export const resolveImportContext = (
  importedProfile: SharedProfile,
  modsData: ModDto[],
) => {
  const importedMods = importedProfile.payload.mods;
  const modsDataByRemoteId = new Map(
    modsData.map((mod) => [mod.remoteId, mod]),
  );
  const availableImportedMods = importedMods
    .map((importedMod) => {
      const modData = modsDataByRemoteId.get(importedMod.remoteId);
      return modData ? { importedMod, modData } : null;
    })
    .filter((entry): entry is AvailableImportedMod => entry !== null);

  return {
    importedMods,
    availableImportedMods,
    modsDataByRemoteId,
    unavailableModsCount: importedMods.length - availableImportedMods.length,
  };
};
