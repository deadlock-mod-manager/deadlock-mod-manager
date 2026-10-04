import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { getErrorMessage } from "@/lib/errors";
import {
  conflictStatusByMod,
  enabledModsSignature,
  groupConflicts,
  orderWithWinner,
} from "@/lib/mods/conflicts";
import { usePersistedStore } from "@/lib/store";
import type { ConflictIgnoreAction } from "@/types/generated/ConflictIgnoreAction";
import type { ProfileConflicts } from "@/types/generated/ProfileConflicts";

const PROFILE_CONFLICTS_QUERY_KEY = ["profile-conflicts"] as const;

const useActiveProfileFolder = () =>
  usePersistedStore(
    (state) => state.profiles[state.activeProfileId]?.folderName ?? null,
  );

export const useProfileConflicts = () => {
  const enabled = useExperimentalFeature("conflict-detection");
  const profileFolder = useActiveProfileFolder();
  const localMods = usePersistedStore((state) => state.localMods);
  const signature = useMemo(() => enabledModsSignature(localMods), [localMods]);

  const query = useQuery({
    queryKey: [...PROFILE_CONFLICTS_QUERY_KEY, profileFolder, signature],
    queryFn: () =>
      invoke<ProfileConflicts>("get_profile_conflicts", { profileFolder }),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    enabled,
  });

  const conflicts = enabled ? query.data?.conflicts : undefined;
  const groups = useMemo(() => groupConflicts(conflicts ?? []), [conflicts]);
  const statusByMod = useMemo(() => conflictStatusByMod(groups), [groups]);

  return { ...query, groups, statusByMod };
};

export const useConflictIgnore = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileFolder = useActiveProfileFolder();

  return useMutation({
    mutationFn: (actions: ConflictIgnoreAction[]) =>
      invoke("update_conflict_ignores", { profileFolder, actions }),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PROFILE_CONFLICTS_QUERY_KEY }),
    onError: (error) =>
      toast.error(t("conflicts.ignoreFailed"), {
        description: getErrorMessage(error),
      }),
  });
};

/** Reorders the profile so one mod loads right before another and wins their shared files. */
export const useMakeConflictWinner = () => {
  const { t } = useTranslation();
  const getOrderedMods = usePersistedStore((state) => state.getOrderedMods);
  const reorderMods = usePersistedStore((state) => state.reorderMods);
  const updateModVpksAfterReorder = usePersistedStore(
    (state) => state.updateModVpksAfterReorder,
  );
  const profileFolder = useActiveProfileFolder();

  return useMutation({
    mutationFn: async ({
      newWinner,
      currentWinner,
    }: {
      newWinner: string;
      currentWinner: string;
    }) => {
      const orderedMods = getOrderedMods();
      const order = orderWithWinner(
        orderedMods.map((mod) => mod.remoteId),
        newWinner,
        currentWinner,
      );
      const modsById = new Map(orderedMods.map((mod) => [mod.remoteId, mod]));
      const modOrderData = order.map((remoteId, index) => [
        remoteId,
        modsById.get(remoteId)?.installedVpks ?? [],
        index,
      ]);
      const mappings = await invoke<Array<[string, string[]]>>(
        "reorder_mods_by_remote_id",
        { modOrderData, profileFolder },
      );
      reorderMods(order);
      updateModVpksAfterReorder(mappings);
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (_, { newWinner }) =>
      toast.success(
        t("conflicts.loadedFirst", {
          mod:
            getOrderedMods().find((mod) => mod.remoteId === newWinner)?.name ??
            newWinner,
        }),
      ),
    onError: (error) =>
      toast.error(t("modOrdering.orderSaveFailed"), {
        description: getErrorMessage(error),
      }),
  });
};
