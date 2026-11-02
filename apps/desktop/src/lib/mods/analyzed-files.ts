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

export const needsAnalysisReview = ({
  addons,
  errors,
}: Pick<AnalyzeAddonsResult, "addons" | "errors">): boolean =>
  errors.length > 0 ||
  addons.some((addon) => !addon.remoteId || !addon.vpkParsed?.fingerprint);

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
