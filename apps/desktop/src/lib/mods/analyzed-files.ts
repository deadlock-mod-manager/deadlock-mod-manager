import type {
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
