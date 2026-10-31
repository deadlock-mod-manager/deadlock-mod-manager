import type { LocalMod, ModDownloadItem } from "@/types/mods";

// Re-uploads receive a random suffix from the provider.
const uploadBaseName = (name: string) =>
  name.replace(/_[0-9a-f]{5}(\.[^.]+)$/i, "$1").toLowerCase();

export function selectUpdateDownloads(
  downloads: ModDownloadItem[],
  installed?: Pick<LocalMod, "selectedDownloads" | "installedFileTree">,
): ModDownloadItem[] {
  const current = downloads.filter((file) => !file.isArchived);
  const names = installed?.selectedDownloads?.length
    ? installed.selectedDownloads.map((file) => file.name)
    : [
        ...new Set(
          installed?.installedFileTree?.files
            .filter((file) => file.is_selected)
            .map((file) => file.archive_name) ?? [],
        ),
      ];
  if (!names.length) return current.length === 1 ? current : [];
  const selected = new Set<ModDownloadItem>();
  for (const name of names) {
    const exact = current.filter((file) => file.name === name);
    const reuploaded = exact.length
      ? exact
      : current.filter(
          (file) => uploadBaseName(file.name) === uploadBaseName(name),
        );
    const matches = reuploaded.length
      ? reuploaded
      : downloads.filter((file) => file.isArchived && file.name === name);
    if (matches.length !== 1) {
      return names.length === 1 && current.length === 1 ? current : [];
    }
    const match = matches[0];
    if (match) selected.add(match);
  }
  // Two old files mapping to one new variant need an explicit choice.
  return selected.size === names.length
    ? downloads.filter((file) => selected.has(file))
    : [];
}
