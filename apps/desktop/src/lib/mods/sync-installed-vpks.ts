import { invoke } from "@tauri-apps/api/core";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { ModVpkFiles } from "@/types/generated/ModVpkFiles";

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
