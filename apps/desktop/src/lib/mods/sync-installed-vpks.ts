import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";

/**
 * Re-enabling a mod puts it back in its place in the load order, which
 * renumbers the mods after it. Read every enabled mod's VPKs back from the
 * manifest so the library does not keep their old names.
 */
export const syncInstalledVpksFromManifest = async (
  profileFolder: string | null,
) => {
  try {
    const { manifest } = await getProfileVpkSnapshot(profileFolder);
    usePersistedStore.getState().updateModVpksAfterReorder(
      Object.entries(manifest.mods)
        .filter(([, entry]) => entry.enabled)
        .map(([remoteId, entry]) => [remoteId, entry.currentVpks]),
    );
  } catch (error) {
    logger
      .withError(error)
      .warn("Failed to read installed VPKs back after enabling a mod");
  }
};
