import { CustomSettingType } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";

const AUTOEXEC_LAUNCH_OPTION_ID = "autoexec-launch-option";

export const useLaunchMap = (onSuccess?: () => void) => {
  const { settings, toggleSetting, getActiveProfile } = usePersistedStore();
  const queryClient = useQueryClient();

  const launchMapMutation = useMutation({
    mutationFn: async (mapName: string) => {
      await invoke("add_map_command_to_autoexec", { mapName });

      const autoexecSetting = settings[AUTOEXEC_LAUNCH_OPTION_ID];
      if (!autoexecSetting?.enabled) {
        toggleSetting(
          AUTOEXEC_LAUNCH_OPTION_ID,
          {
            id: AUTOEXEC_LAUNCH_OPTION_ID,
            key: "-exec",
            value: "autoexec",
            type: CustomSettingType.LAUNCH_OPTION,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          true,
        );
      }

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      const updatedSettings = usePersistedStore.getState().settings;
      const baseArgs = await getAdditionalArgs(Object.values(updatedSettings));
      const additionalArgs = baseArgs ? `${baseArgs} -condebug` : "-condebug";

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
