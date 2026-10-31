import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { requirementState, unmetRequirements } from "@/lib/mods/requirements";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useModelConflictPrompt } from "@/components/providers/model-conflict";
import { getMod } from "@/lib/api-client";
import logger from "@/lib/logger";
import { invokeGuarded } from "@/lib/game-guard";
import { resolveModelConflict } from "@/lib/mods/model-conflict-install";
import { modDetailQueryKey } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import type { ModDependency } from "@/types/dependencies";
import {
  type InstallableMod,
  type LocalMod,
  type LocalModWithFiles,
  ModStatus,
} from "@/types/mods";

export function useModelConflictInstall() {
  const askModelConflict = useModelConflictPrompt();
  const confirm = useConfirm();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The dependency label is the author's free text, so prefer the mod's real name
  const requirementName = async (
    dependency: ModDependency,
    localMods: readonly LocalMod[],
  ) => {
    const remoteId = dependency.remoteId;
    if (!remoteId) return dependency.label;
    const local = localMods.find((mod) => mod.remoteId === remoteId);
    if (local) return local.name;
    try {
      const details = await queryClient.fetchQuery({
        queryKey: modDetailQueryKey(remoteId),
        queryFn: () => getMod(remoteId),
        staleTime: STALE_TIME_API,
        meta: { skipGlobalErrorHandler: true },
      });
      return details.name;
    } catch {
      return dependency.label || remoteId;
    }
  };
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
      const state = usePersistedStore.getState();
      const unmet = unmetRequirements(mod.dependencies ?? [], state.localMods);
      if (!bisectOriginalEnabled && unmet.length > 0) {
        const proceed = await confirm({
          title: t("modDependencies.installTitle"),
          body: t("modDependencies.installBody", {
            requirements: (
              await Promise.all(
                unmet.map(
                  async (dependency) =>
                    `${await requirementName(dependency, state.localMods)} (${t(`modDependencies.state.${requirementState(dependency, state.localMods)}`)})`,
                ),
              )
            ).join(", "),
          }),
          actionButton: t("modDependencies.installAnyway"),
          cancelButton: t("common.cancel"),
        });
        if (!proceed || !isCurrentProfile()) return null;
      }
      const requiredIds = new Set(
        (mod.dependencies ?? [])
          .filter(
            (dependency) =>
              dependency.level !== "recommended" && !dependency.mustBeDisabled,
          )
          .flatMap((dependency) =>
            dependency.remoteId ? [dependency.remoteId] : [],
          ),
      );
      return resolveModelConflict(
        async ({ replace, allow }) => {
          const replaceConflictingMods = replace.filter(
            (id) => !requiredIds.has(id),
          );
          const protectedRequirements = replace.filter((id) =>
            requiredIds.has(id),
          );
          const result = await invokeGuarded<InstallableMod>("install_mod", {
            deadlockMod: {
              id: mod.remoteId,
              name: mod.name,
              is_map: mod.isMap,
              file_tree: mod.file_tree,
            },
            profileFolder,
            replaceConflictingMods,
            allowConflictingMods: [...allow, ...protectedRequirements],
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
          if (
            ids.every((id) => keepBothWith?.includes(id) || requiredIds.has(id))
          )
            return "keepBoth";
          const { localMods } = usePersistedStore.getState();
          const conflicts = ids
            .filter((id) => !requiredIds.has(id))
            .flatMap((id) => {
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
