import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";

export const MOD_COMPATIBILITY_QUERY_KEY = ["mod-compatibility-settings"];

export type ModCompatibilityController = ReturnType<typeof useModCompatibility>;

export function useModCompatibility(
  profileFolder: string | null,
  enabled: boolean,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gamePath = usePersistedStore((state) => state.gamePath);
  const mods = usePersistedStore((state) => state.localMods);
  const inputs = mods.map((mod) => ({
    id: mod.remoteId,
    status: mod.status,
    vpks: mod.installedVpks,
  }));
  const preference = useQuery({
    queryKey: [...MOD_COMPATIBILITY_QUERY_KEY, profileFolder, inputs],
    queryFn: () =>
      invoke<Record<string, boolean>>("get_mod_compatibility_settings", {
        profileFolder,
      }),
    enabled: enabled && !!gamePath,
    staleTime: 30_000,
  });
  const game = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    enabled: enabled && !!gamePath,
    refetchInterval: 5000,
    staleTime: 5000,
  });
  const pendingChanges = useIsMutating({
    mutationKey: MOD_COMPATIBILITY_QUERY_KEY,
  });
  const changePreference = useMutation({
    mutationKey: MOD_COMPATIBILITY_QUERY_KEY,
    mutationFn: ({ modId, enabled }: { modId: string; enabled: boolean }) =>
      invoke<void>("set_mod_compatibility_for_mod", {
        modId,
        enabled,
        profileFolder,
      }),
    onError: (error) => {
      toast.error(t("myMods.compatibility.changeFailed"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: MOD_COMPATIBILITY_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: ["mod-compatibility-analysis"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mod-compatibility-resolved-analysis"],
        }),
      ]),
  });
  return { preference, changePreference, game, pendingChanges, gamePath };
}
