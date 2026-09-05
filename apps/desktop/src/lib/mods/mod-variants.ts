import type { LocalMod, ModFileTree } from "@/types/mods";

export const deriveActiveArchiveNames = (mod: LocalMod | null): Set<string> => {
  const names = new Set<string>();
  const files = mod?.installedFileTree?.files ?? [];
  for (const f of files) {
    if (f.is_selected && f.archive_name) names.add(f.archive_name);
  }
  // A tree that lists files but selects none is an explicit empty selection,
  // not missing data, so the stale fallbacks below must not resurrect it.
  if (files.length > 0 && !files.some((f) => f.is_selected)) {
    return names;
  }
  if (names.size === 0 && mod?.activeVariantArchive) {
    for (const part of mod.activeVariantArchive.split(",")) {
      if (part) names.add(part);
    }
  }
  // Only usable when nothing is known about the files on disk: the list keeps
  // archives that were downloaded once but later deselected.
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

/**
 * How many variants are currently active. Prefers archive-level counting, but
 * mods installed before variant tracking existed carry no archive names, so we
 * fall back to the enabled files on disk.
 */
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

/**
 * The archives the user picked in the download dialog. Empty when the mod only
 * ever offered one download, because then nothing was chosen and there is no
 * decision to carry over.
 */
export const deriveDownloadTimeArchiveNames = (
  mod: LocalMod | null,
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

/**
 * Turns the variant picked during download into a file selection, so enabling a
 * mod does not ask the same question twice. Returns null when the choice cannot
 * be applied - no choice was ever made, or none of the files on disk belong to
 * the chosen archives - and the file selector has to be shown after all.
 */
export const applyDownloadTimeSelection = (
  mod: LocalMod | null,
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
