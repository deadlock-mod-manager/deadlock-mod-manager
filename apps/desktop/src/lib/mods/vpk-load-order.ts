import type { ModFile } from "@/types/mods";

// A mod's file tree is its load order: an earlier file gets the lower pak
// number, so it wins over later files of the same mod. New files take the
// author's place for their archive, which is its place in the downloads list.

const archiveRank = (archiveName: string, archiveNames: string[]) => {
  const index = archiveNames.indexOf(archiveName);
  return index === -1 ? archiveNames.length : index;
};

export const sortNamesInLoadOrder = (
  names: string[],
  files: ModFile[],
): string[] => {
  const positions = new Map(files.map((file, index) => [file.name, index]));
  return [...names].sort(
    (a, b) =>
      (positions.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
};

/** Places each new file before the first file from a later archive. */
export const insertFilesInAuthorOrder = (
  files: ModFile[],
  added: ModFile[],
  archiveNames: string[],
): ModFile[] => {
  const result = [...files];
  for (const file of added) {
    const rank = archiveRank(file.archive_name, archiveNames);
    const before = result.findIndex(
      (existing) => archiveRank(existing.archive_name, archiveNames) > rank,
    );
    result.splice(before === -1 ? result.length : before, 0, file);
  }
  return result;
};

export const sortFilesInAuthorOrder = (
  files: ModFile[],
  archiveNames: string[],
): ModFile[] =>
  [...files].sort(
    (a, b) =>
      archiveRank(a.archive_name, archiveNames) -
        archiveRank(b.archive_name, archiveNames) ||
      a.path.localeCompare(b.path),
  );

/**
 * Puts the named files in the given order within the slots they already
 * hold, so files outside the list keep their places.
 */
export const reorderFiles = (
  files: ModFile[],
  orderedNames: string[],
): ModFile[] => {
  const byName = new Map(files.map((file) => [file.name, file]));
  const queue = orderedNames.flatMap((name) => byName.get(name) ?? []);
  const moving = new Set(queue.map((file) => file.name));
  let next = 0;
  return files.map((file) => (moving.has(file.name) ? queue[next++] : file));
};
