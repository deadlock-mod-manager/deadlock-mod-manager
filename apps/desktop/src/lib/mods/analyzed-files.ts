import type {
  AnalyzeAddonsResult,
  LocalAddonInfo,
  ModDownloadItem,
  ModFileTree,
} from "@/types/mods";

type AnalyzedFile = Pick<LocalAddonInfo, "fileName" | "matchInfo"> & {
  size: number;
};

export const buildAnalyzedFileTree = (
  remoteId: string,
  addons: readonly AnalyzedFile[],
  downloads: readonly ModDownloadItem[],
  previous?: ModFileTree,
): ModFileTree => {
  const files = addons.map((addon) => {
    const sourceName = addon.matchInfo?.sourcePath?.split(/[\\/]/).pop();
    const previousFiles =
      previous?.files.filter(
        (file) =>
          file.name === addon.fileName ||
          (sourceName && file.name === sourceName),
      ) ?? [];
    const previousFile =
      previousFiles.length === 1 ? previousFiles[0] : undefined;
    const fileId = addon.matchInfo?.fileId;
    const archive = fileId
      ? downloads.find(
          (download) =>
            download.url ===
            `gamebanana-file://${encodeURIComponent(remoteId)}/${fileId}`,
        )
      : undefined;
    return {
      name: previousFile?.name ?? addon.fileName,
      path: previousFile?.path ?? addon.fileName,
      size: addon.size,
      is_selected: true,
      archive_name: archive?.name ?? previousFile?.archive_name ?? "",
    };
  });
  const activeNames = new Set(files.map((file) => file.name));
  for (const file of previous?.files ?? []) {
    if (!activeNames.has(file.name))
      files.push({ ...file, is_selected: false });
  }
  return {
    files,
    total_files: files.length,
    has_multiple_files: files.length > 1,
  };
};

type IdentifiedFile = Pick<
  LocalAddonInfo,
  "fileName" | "remoteId" | "matchInfo" | "manifestModId"
>;

/**
 * A file that can be one of its identified mod's files: one the game loads, or
 * that mod's own disabled `<id>_` file (a parked copy, an unselected variant).
 */
export const canBelongToIdentifiedMod = (
  addon: Pick<LocalAddonInfo, "fileName" | "remoteId" | "hasEnabledVpkName">,
): boolean =>
  addon.hasEnabledVpkName ||
  (!!addon.remoteId && addon.fileName.startsWith(`${addon.remoteId}_`));

/**
 * A file the game doesn't load that isn't DMM's either: not its mod's disabled
 * file, and not one the profile's manifest records. A hand-placed
 * `coolskin.vpk`, even when its contents match a mod, is never one of that
 * mod's enabled files.
 */
export const isIgnoredByGame = (
  addon: IdentifiedFile & Pick<LocalAddonInfo, "hasEnabledVpkName">,
): boolean => !canBelongToIdentifiedMod(addon) && addon.manifestModId == null;

/**
 * True when only the file's `<id>_` name prefix identifies it: no hash match,
 * and no manifest entry records the file. Such a parked copy is DMM's only when
 * its mod is still in the library; a mod whose installed files were deleted
 * outside DMM leaves its Mod Options variants behind like this.
 */
export const isIdentifiedByNameOnly = <T extends IdentifiedFile>(
  addon: T,
): addon is T & { remoteId: string } =>
  !!addon.remoteId &&
  !addon.matchInfo &&
  addon.manifestModId == null &&
  addon.fileName.startsWith(`${addon.remoteId}_`);

/**
 * A parked file whose mod is no longer in the profile's library. Analyze asks
 * the user what to do with it instead of putting the mod back.
 */
export const isUnrecordedLeftover = (
  addon: IdentifiedFile,
  libraryIds: ReadonlySet<string>,
): boolean => isIdentifiedByNameOnly(addon) && !libraryIds.has(addon.remoteId);

export const needsAnalysisReview = (
  { addons, errors }: Pick<AnalyzeAddonsResult, "addons" | "errors">,
  libraryIds: ReadonlySet<string>,
): boolean =>
  errors.length > 0 ||
  addons.some(
    (addon) =>
      !addon.remoteId ||
      !addon.vpkParsed?.fingerprint ||
      isUnrecordedLeftover(addon, libraryIds) ||
      isIgnoredByGame(addon),
  );

/**
 * True when the profile's manifest already assigns every file in this group to
 * the mod they were identified as. Manifest reconciliation restores such mods
 * with their recorded files, order and enabled state, so registering them again
 * would only cost catalog requests and could overwrite what DMM recorded.
 */
export const isRecordedInManifest = (
  remoteId: string,
  addons: readonly Pick<LocalAddonInfo, "manifestModId">[],
): boolean =>
  addons.length > 0 &&
  addons.every(
    (addon) => addon.manifestModId != null && addon.manifestModId === remoteId,
  );
