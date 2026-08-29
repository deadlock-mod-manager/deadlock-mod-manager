import type { LocalMod } from "@/types/mods";

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
