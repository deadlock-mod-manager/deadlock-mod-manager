import { relaunch } from "@tauri-apps/plugin-process";
import { useMutation } from "@tanstack/react-query";
import { updateFlatpak } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const logger = createLogger("flatpak-update");

export const useFlatpakUpdate = () => {
  const {
    mutateAsync: installFlatpakUpdate,
    isPending: isInstallingFlatpakUpdate,
  } = useMutation({
    mutationFn: (url: string) => updateFlatpak(url),
    onSuccess: async () => {
      logger.info("Flatpak update complete — relaunching");
      await relaunch();
    },
    onError: (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.withError(error).error("Flatpak update failed");
    },
  });

  return {
    installFlatpakUpdate,
    isInstallingFlatpakUpdate,
  };
};
