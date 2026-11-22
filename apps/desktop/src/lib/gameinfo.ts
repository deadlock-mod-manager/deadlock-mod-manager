import { invoke } from "@tauri-apps/api/core";
import logger from "@/lib/logger";

export const restoreProfileGameinfo = async (
  activeProfileFolder: string | null,
): Promise<boolean> => {
  try {
    return await invoke<boolean>("cleanup_stale_server_gameinfo", {
      activeProfileFolder,
    });
  } catch (error) {
    logger
      .withError(error)
      .warn("Stale server gameinfo cleanup failed; continuing anyway");
    return false;
  }
};
