import { useMutation } from "@tanstack/react-query";
import { useModelConflictPrompt } from "@/components/providers/model-conflict";
import logger from "@/lib/logger";
import { invokeGuarded } from "@/lib/game-guard";
import { resolveModelConflict } from "@/lib/mods/model-conflict-install";
import { usePersistedStore } from "@/lib/store";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import {
  type InstallableMod,
  type LocalModWithFiles,
  ModStatus,
} from "@/types/mods";

export function useModelConflictInstall() {
  const askModelConflict = useModelConflictPrompt();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({
      mod,
      profileFolder,
      bisectOriginalEnabled,
      keepBothWith,
    }: {
      mod: LocalModWithFiles;
      profileFolder: string | null;
      bisectOriginalEnabled?: string[];
      keepBothWith?: string[];
    }) => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const isCurrentProfile = () =>
        usePersistedStore.getState().activeProfileId === profileId;
      return resolveModelConflict(
        async ({ replace: replaceConflictingMods, allow }) => {
          const result = await invokeGuarded<InstallableMod>("install_mod", {
            deadlockMod: {
              id: mod.remoteId,
              name: mod.name,
              is_map: mod.isMap,
              file_tree: mod.file_tree,
            },
            profileFolder,
            replaceConflictingMods,
            allowConflictingMods: allow,
            bisectOriginalEnabled,
          });
          if (replaceConflictingMods.length > 0) {
            try {
              const { manifest } = await getProfileVpkSnapshot(profileFolder);
              const state = usePersistedStore.getState();
              for (const id of replaceConflictingMods) {
                const entry = manifest.mods[id];
                if (entry && !entry.enabled) {
                  state.setModEnabledInProfile(profileId, id, false);
                  if (isCurrentProfile()) {
                    state.setModStatus(id, ModStatus.Downloaded);
                    const previous = state.localMods.find(
                      (candidate) => candidate.remoteId === id,
                    );
                    state.setInstalledVpks(id, [], previous?.installedFileTree);
                  }
                }
              }
            } catch (error) {
              logger
                .withError(error)
                .warn("Skin switched but library state could not be refreshed");
            }
          }
          return result;
        },
        async (ids) => {
          if (bisectOriginalEnabled) return null;
          if (ids.every((id) => keepBothWith?.includes(id))) return "keepBoth";
          const { localMods } = usePersistedStore.getState();
          const conflicts = ids.flatMap((id) => {
            const found = localMods.find(
              (candidate) => candidate.remoteId === id,
            );
            return found ? [found] : [];
          });
          return askModelConflict(mod, conflicts);
        },
        isCurrentProfile,
      );
    },
  });
}
