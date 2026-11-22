import { invoke } from "@tauri-apps/api/core";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { ModVpkFiles } from "@/types/generated/ModVpkFiles";

/**
 * Re-enabling a mod puts it back in its place in the load order, which
 * renumbers the mods after it. Read every enabled mod's VPKs back from the
 * manifest so the library does not keep their old names.
 */
export const syncInstalledVpksFromManifest = async (
  profileFolder: string | null,
) => {
  try {
    const mods = await invoke<ModVpkFiles[]>("get_enabled_mod_vpk_files", {
      profileFolder,
    });
    usePersistedStore
      .getState()
      .updateModVpksAfterReorder(mods.map(({ modId, vpks }) => [modId, vpks]));
  } catch (error) {
    logger
      .withError(error)
      .warn("Failed to read installed VPKs back after enabling a mod");
  }
};
