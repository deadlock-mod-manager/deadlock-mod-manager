import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getModsStorePath } from "@/lib/download-cache";
import { sortFilesInAuthorOrder } from "@/lib/mods/vpk-load-order";
import type { LocalMod, ModFileTree } from "@/types/mods";

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
