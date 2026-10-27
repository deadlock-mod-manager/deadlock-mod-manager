import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import type { ModdingAssetSelection } from "@/types/generated/ModdingAssetSelection";

export interface AssetSelectionRule extends ModdingAssetSelection {
  fileCount: number;
}

export type AssetSelection = ReadonlyMap<string, AssetSelectionRule>;

function inside(path: string, folder: string): boolean {
  return path !== folder && (!folder || path.startsWith(`${folder}/`));
}

function inheritedSelection(selection: AssetSelection, path: string): boolean {
  let current = path;
  while (true) {
    const rule = selection.get(current);
    if (rule && (current === path || rule.directory)) return rule.selected;
    if (!current) return false;
    current = current.slice(0, Math.max(0, current.lastIndexOf("/")));
  }
}

export function assetSelectionCount(
  selection: AssetSelection,
  node?: ModdingArchiveEntry,
): number {
  let count =
    node && inheritedSelection(selection, node.path) ? node.fileCount : 0;
  for (const rule of selection.values()) {
    if (!node || (node.directory && inside(rule.path, node.path))) {
      count += rule.selected ? rule.fileCount : -rule.fileCount;
    }
  }
  return count;
}

export function assetSelectionState(
  selection: AssetSelection,
  node: ModdingArchiveEntry,
): boolean | "indeterminate" {
  const count = assetSelectionCount(selection, node);
  return count === 0
    ? false
    : count === node.fileCount
      ? true
      : "indeterminate";
}

export function selectArchiveAsset(
  selection: AssetSelection,
  node: ModdingArchiveEntry,
  selected: boolean,
): Map<string, AssetSelectionRule> {
  return selectArchiveAssets(selection, [node], selected);
}

export function selectArchiveAssets(
  selection: AssetSelection,
  nodes: readonly ModdingArchiveEntry[],
  selected: boolean,
): Map<string, AssetSelectionRule> {
  const next = new Map(selection);
  for (const node of nodes) {
    for (const path of next.keys()) {
      if (path === node.path || (node.directory && inside(path, node.path)))
        next.delete(path);
    }
    if (selected !== inheritedSelection(next, node.path)) {
      next.set(node.path, {
        path: node.path,
        directory: node.directory,
        selected,
        fileCount: node.fileCount,
      });
    }
  }
  return next;
}

export function archiveSelectionPayload(
  selection: AssetSelection,
): ModdingAssetSelection[] {
  return [...selection.values()].map(({ path, directory, selected }) => ({
    path,
    directory,
    selected,
  }));
}

export function archiveQueryKey(
  archivePath: string,
  directory: string,
  search = "",
) {
  return ["workbench-archive", archivePath, directory, search];
}
