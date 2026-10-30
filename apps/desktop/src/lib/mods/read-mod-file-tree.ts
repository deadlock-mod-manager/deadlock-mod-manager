import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getModsStorePath } from "@/lib/download-cache";
import { sortFilesInAuthorOrder } from "@/lib/mods/vpk-load-order";
import type { LocalMod, ModFileTree } from "@/types/mods";

/**
 * Rebuilds a downloaded mod's file tree from the archives in its folder, for
 * mods with no stored tree. The folder lists archives in no useful order, so
 * the files are put back in the author's order, which is their load order.
 */
export const readModFileTree = async (mod: LocalMod): Promise<ModFileTree> => {
  const modDir = await join(await getModsStorePath(), mod.remoteId);
  const tree = await invoke<ModFileTree>("get_mod_file_tree", {
    modPath: modDir,
  });
  return {
    ...tree,
    files: sortFilesInAuthorOrder(
      tree.files,
      (mod.downloads ?? []).map((download) => download.name),
    ),
  };
};
