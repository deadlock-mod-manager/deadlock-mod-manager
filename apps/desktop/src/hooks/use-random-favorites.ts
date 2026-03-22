import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

const logger = createLogger("random-favorites");

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const MAX_MODS = 99;

export const useRandomFavorites = () => {
  const randomFavoritesEnabled = usePersistedStore(
    (state) => state.randomFavoritesEnabled,
  );
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const localMods = usePersistedStore((state) => state.localMods);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );

  const activateRandomFavorites = async (): Promise<number> => {
    const activeProfile = getActiveProfile();
    if (!activeProfile) return 0;

    const favoriteMods = activeProfile.favoriteMods ?? [];
    if (favoriteMods.length === 0) return 0;

    const profileFolder = activeProfile.folderName ?? null;

    const favoriteLocalMods = localMods.filter(
      (mod) =>
        favoriteMods.includes(mod.remoteId) &&
        (mod.status === ModStatus.Installed ||
          mod.status === ModStatus.Downloaded),
    );

    if (favoriteLocalMods.length === 0) return 0;

    const shuffled = shuffleArray(favoriteLocalMods);
    const toEnable = shuffled.slice(0, MAX_MODS);
    const toEnableIds = new Set(toEnable.map((m) => m.remoteId));

    const currentlyInstalled = localMods.filter(
      (mod) =>
        mod.status === ModStatus.Installed &&
        mod.installedVpks &&
        mod.installedVpks.length > 0,
    );

    // Disable mods that are currently installed but not in the random selection
    for (const mod of currentlyInstalled) {
      if (!toEnableIds.has(mod.remoteId)) {
        try {
          await invoke("uninstall_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          });
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          setModEnabledInCurrentProfile(mod.remoteId, false);
        } catch (error) {
          logger
            .withMetadata({ modId: mod.remoteId })
            .withError(
              error instanceof Error ? error : new Error(String(error)),
            )
            .warn("Failed to disable mod during random favorites");
        }
      }
    }

    // Enable favorite mods that aren't currently installed
    let enabledCount = 0;
    for (const mod of toEnable) {
      if (mod.status === ModStatus.Installed) {
        enabledCount++;
        continue;
      }

      try {
        const result = (await invoke("install_mod", {
          deadlockMod: {
            id: mod.remoteId,
            name: mod.name,
            file_tree: mod.installedFileTree,
          },
          profileFolder,
        })) as { id: string; installed_vpks: string[] };

        setInstalledVpks(mod.remoteId, result.installed_vpks);
        setModStatus(mod.remoteId, ModStatus.Installed);
        setModEnabledInCurrentProfile(mod.remoteId, true);
        enabledCount++;
      } catch (error) {
        logger
          .withMetadata({ modId: mod.remoteId })
          .withError(error instanceof Error ? error : new Error(String(error)))
          .warn("Failed to enable mod during random favorites");
      }
    }

    logger
      .withMetadata({
        totalFavorites: favoriteMods.length,
        enabledCount,
      })
      .info("Random favorites activation complete");

    return enabledCount;
  };

  return { activateRandomFavorites, randomFavoritesEnabled };
};
