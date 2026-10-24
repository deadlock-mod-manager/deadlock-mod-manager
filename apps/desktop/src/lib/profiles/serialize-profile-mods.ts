import type { ProfileModDownload } from "@deadlock-mods/shared";
import type { LocalMod, ModFileTree } from "@/types/mods";
import type { ModProfile } from "@/types/profiles";

export interface SerializedProfileMod {
  remoteId: string;
  submissionType: "mod" | "sound";
  fileTree?: ModFileTree;
  selectedDownloads?: ProfileModDownload[];
}

const serializeProfileMod = (
  remoteId: string,
  localMod: LocalMod | undefined,
): SerializedProfileMod => {
  const serialized: SerializedProfileMod = {
    remoteId,
    submissionType: localMod?.isAudio ? "sound" : "mod",
  };

  if (localMod?.installedFileTree) {
    // Older installs can lack selection info; treat that as "every file".
    const hasAnySelected = localMod.installedFileTree.files.some(
      (f) => f.is_selected,
    );
    serialized.fileTree = hasAnySelected
      ? localMod.installedFileTree
      : {
          ...localMod.installedFileTree,
          files: localMod.installedFileTree.files.map((f) => ({
            ...f,
            is_selected: true,
          })),
        };
  }

  if (localMod?.downloads && localMod.downloads.length > 0) {
    const selected = localMod.selectedDownloads?.length
      ? localMod.selectedDownloads
      : [localMod.downloads[0]];
    serialized.selectedDownloads = selected.map((d) => ({
      remoteId,
      file: d.name,
      url: d.url,
      size: d.size,
    }));
  }

  return serialized;
};

/** The enabled mods of a profile in the share format, with their load order. */
export const serializeEnabledProfileMods = (
  profile: Pick<ModProfile, "enabledMods">,
  mods: LocalMod[],
) => {
  const modsById = new Map(mods.map((mod) => [mod.remoteId, mod]));
  const enabledMods = Object.values(profile.enabledMods)
    .filter((entry) => entry.enabled)
    .map((entry) =>
      serializeProfileMod(entry.remoteId, modsById.get(entry.remoteId)),
    );

  const enabledIds = new Set(enabledMods.map((mod) => mod.remoteId));
  const orderedIds = mods
    .filter((mod) => enabledIds.has(mod.remoteId))
    .sort(
      (left, right) =>
        (left.installOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.installOrder ?? Number.MAX_SAFE_INTEGER),
    )
    .map((mod) => mod.remoteId);
  const ordered = new Set(orderedIds);

  return {
    mods: enabledMods,
    loadOrder: [
      ...orderedIds,
      ...enabledMods
        .map((mod) => mod.remoteId)
        .filter((remoteId) => !ordered.has(remoteId)),
    ],
  };
};
