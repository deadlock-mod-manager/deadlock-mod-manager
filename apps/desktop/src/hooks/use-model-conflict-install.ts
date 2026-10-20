import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
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
  const { t } = useTranslation();
  const confirm = useConfirm();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({
      mod,
      profileFolder,
      bisectOriginalEnabled,
    }: {
      mod: LocalModWithFiles;
      profileFolder: string | null;
      bisectOriginalEnabled?: string[];
    }) => {
      const profileId = usePersistedStore.getState().activeProfileId;
      const isCurrentProfile = () =>
        usePersistedStore.getState().activeProfileId === profileId;
      return resolveModelConflict(
        async (replaceConflictingMods) => {
          const result = await invokeGuarded<InstallableMod>("install_mod", {
            deadlockMod: {
              id: mod.remoteId,
              name: mod.name,
              is_map: mod.isMap,
              file_tree: mod.file_tree,
            },
            profileFolder,
            replaceConflictingMods,
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
          if (bisectOriginalEnabled) return false;
          const mods = usePersistedStore.getState().localMods;
          const names = ids.map(
            (id) =>
              mods.find((candidate) => candidate.remoteId === id)?.name ?? id,
          );
          return Boolean(
            await confirm({
              title: t("modelConflict.title"),
              body: t("modelConflict.body", {
                mod: mod.name,
                conflicts: names.join(", "),
              }),
              actionButton: t("modelConflict.useSkin", { mod: mod.name }),
              cancelButton: t("modelConflict.keepCurrent"),
              actionButtonVariant: "default",
            }),
          );
        },
        isCurrentProfile,
      );
    },
  });
}
