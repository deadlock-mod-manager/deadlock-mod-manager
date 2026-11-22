import type {
  LocalMod,
  ModDownloadItem,
  ModFile,
  ModFileTree,
} from "@/types/mods";
import type { VpkManifest } from "@/types/profiles";

export const getQueuedDownloads = (mod: LocalMod): ModDownloadItem[] =>
  mod.selectedDownloads?.length ? mod.selectedDownloads : (mod.downloads ?? []);

export const previousInstallSelection = (
  mod: Pick<LocalMod, "remoteId" | "installedVpks" | "installedFileTree">,
  manifest?: VpkManifest,
): ModFileTree | undefined => {
  const entry = manifest?.mods[mod.remoteId];
  const wasInstalled =
    (mod.installedVpks?.length ?? 0) > 0 ||
    (entry?.disabledVpks.length ?? 0) > 0;
  return wasInstalled ? mod.installedFileTree : undefined;
};

export const requiresFileSelection = (tree: ModFileTree): boolean => {
  if (!tree.has_multiple_files) return false;
  const archives = new Set<string>();
  for (const file of tree.files) {
    if (!file.archive_name || archives.has(file.archive_name)) return true;
    archives.add(file.archive_name);
  }
  return false;
};

export const deriveActiveArchiveNames = (mod: LocalMod | null): Set<string> => {
  const names = new Set<string>();
  const files = mod?.installedFileTree?.files ?? [];
  for (const f of files) {
    if (f.is_selected && f.archive_name) names.add(f.archive_name);
  }
  if (files.length > 0 && !files.some((f) => f.is_selected)) {
    return names;
  }
  if (names.size === 0 && mod?.activeVariantArchive) {
    for (const part of mod.activeVariantArchive.split(",")) {
      if (part) names.add(part);
    }
  }
  if (
    names.size === 0 &&
    files.length === 0 &&
    mod?.selectedDownloads &&
    mod.selectedDownloads.length > 0
  ) {
    for (const d of mod.selectedDownloads) {
      names.add(d.name);
    }
  }
  return names;
};

export const withUnlistedActiveArchives = (
  downloads: ModDownloadItem[],
  activeArchiveNames: Set<string>,
): ModDownloadItem[] => {
  const listed = new Set(downloads.map((d) => d.name));
  const unlisted = [...activeArchiveNames]
    .filter((name) => !listed.has(name))
    .map(
      (name): ModDownloadItem => ({
        name,
        url: "",
        size: 0,
        createdAt: null,
        updatedAt: null,
        md5Checksum: null,
      }),
    );
  return [...downloads, ...unlisted];
};

export const deriveActiveVariantCount = (mod: LocalMod | null): number => {
  const archiveNames = deriveActiveArchiveNames(mod);
  if (archiveNames.size > 0) {
    return archiveNames.size;
  }
  const files = mod?.installedFileTree?.files ?? [];
  const enabledFiles = files.filter((f) => f.is_selected).length;
  if (enabledFiles > 0) {
    return enabledFiles;
  }
  if (files.length > 0) {
    return 0;
  }
  return mod?.installedVpks?.length ?? 0;
};

type DownloadTimeChoice = Pick<
  LocalMod,
  "downloads" | "selectedDownloads" | "activeVariantArchive"
>;

const deriveDownloadTimeArchiveNames = (
  mod: DownloadTimeChoice | null,
): Set<string> => {
  const names = new Set<string>();
  if ((mod?.downloads?.length ?? 0) <= 1) {
    return names;
  }
  for (const d of mod?.selectedDownloads ?? []) {
    if (d.name) {
      names.add(d.name);
    }
  }
  if (names.size === 0 && mod?.activeVariantArchive) {
    for (const part of mod.activeVariantArchive.split(",")) {
      if (part) {
        names.add(part);
      }
    }
  }
  return names;
};

export const applyDownloadTimeSelection = (
  mod: DownloadTimeChoice | null,
  fileTree: ModFileTree,
): ModFileTree | null => {
  const chosen = deriveDownloadTimeArchiveNames(mod);
  if (chosen.size === 0) {
    return null;
  }

  const files = fileTree.files.map((f) => ({
    ...f,
    is_selected: !!f.archive_name && chosen.has(f.archive_name),
  }));

  if (!files.some((f) => f.is_selected)) {
    return null;
  }

  return { ...fileTree, files };
};

export const deriveFilesForArchive = (
  mod: LocalMod,
  archiveName: string,
): ModFile[] =>
  (mod.installedFileTree?.files ?? []).filter(
    (f) => f.archive_name === archiveName,
  );

export const deriveReusableFilesForArchive = (
  mod: LocalMod,
  archive: ModDownloadItem,
): ModFile[] => {
  const stored = mod.selectedDownloads?.find((d) => d.name === archive.name);
  const isSameUpload =
    stored?.url === archive.url &&
    (!stored.md5Checksum ||
      !archive.md5Checksum ||
      stored.md5Checksum === archive.md5Checksum);
  const isFullyTagged = (mod.installedFileTree?.files ?? []).every(
    (f) => f.archive_name,
  );
  return isSameUpload && isFullyTagged
    ? deriveFilesForArchive(mod, archive.name)
    : [];
};
