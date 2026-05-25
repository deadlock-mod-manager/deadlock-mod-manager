import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { enableAutoexecLaunchOptionIfDisabled } from "@/lib/autoexec/launch-option";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";

export const useLaunchMap = (onSuccess?: () => void) => {
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const queryClient = useQueryClient();

  const launchMapMutation = useMutation({
    mutationFn: async (mapName: string) => {
      await invoke("add_map_command_to_autoexec", { mapName });

      enableAutoexecLaunchOptionIfDisabled();

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      const storeState = usePersistedStore.getState();
      const additionalArgs = await getAdditionalArgs(
        Object.values(storeState.settings),
        storeState.gamePresenceEnabled,
      );

      await invoke("start_game", {
        vanilla: false,
        additionalArgs,
        profileFolder,
      });

      await queryClient.invalidateQueries({
        queryKey: ["is-game-running"],
      });
    },
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess,
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    },
  });

  return {
    launchMap: launchMapMutation.mutate,
    isPending: launchMapMutation.isPending,
  };
};
