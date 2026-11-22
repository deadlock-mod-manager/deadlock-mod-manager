import { invoke } from "@tauri-apps/api/core";
import logger from "@/lib/logger";

/**
 * Puts the user's own profile back into gameinfo.gi after a previous run staged
 * a server folder. Returns whether anything actually changed, which is what
 * tells callers the game has to restart.
 */
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
