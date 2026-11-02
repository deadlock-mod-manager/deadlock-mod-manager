import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";
import type { LocalMod, ModDownloadItem } from "@/types/mods";

export const nativeComponentDownloads = (
  installation: NativeSourceInstallation,
  componentIds: string[],
  downloads: ModDownloadItem[],
) => {
  const artifacts = new Set(
    installation.components
      .filter((component) => componentIds.includes(component.id))
      .flatMap((component) => component.files.map((file) => file.artifactId)),
  );
  return downloads.filter((file) => {
    const id = file.url.split("/").pop();
    return id !== undefined && artifacts.has(decodeURIComponent(id));
  });
};

/** Carry archive renames only through the publisher's stable artifact ID. */
export const nativeManualFileTree = (
  installed: LocalMod | undefined,
  downloads: ModDownloadItem[],
) => {
  const tree = installed?.installedFileTree;
  if (!tree || !installed.source) return tree;
  const renamed = new Map<string, string>();
  for (const previous of installed.selectedDownloads ?? []) {
    const id = previous.url.split("/").pop();
    const current = downloads.find(
      (file) => id !== undefined && file.url.split("/").pop() === id,
    );
    if (current) renamed.set(previous.name, current.name);
  }
  const remapped = structuredClone(tree);
  for (const file of remapped.files) {
    const archive = renamed.get(file.archive_name);
    if (archive) {
      file.path = file.path.startsWith(`${file.archive_name}/`)
        ? `${archive}/${file.path.slice(file.archive_name.length + 1)}`
        : file.path;
      file.archive_name = archive;
    }
  }
  return remapped;
};

/** Updates carry explicit choices; defaults only apply to first installation. */
export const nativeChoicesFit = (
  installation: NativeSourceInstallation,
  ids: string[],
) => {
  if (installation.mode === "manual") return true;
  const selected = new Set(ids);
  return (
    selected.size === ids.length &&
    ids.every((id) =>
      installation.components.some((component) => component.id === id),
    ) &&
    installation.requiredComponents.every((id) => selected.has(id)) &&
    installation.choiceGroups.every((group) => {
      const count = group.componentIds.filter((id) => selected.has(id)).length;
      return count >= group.minSelections && count <= group.maxSelections;
    })
  );
};
