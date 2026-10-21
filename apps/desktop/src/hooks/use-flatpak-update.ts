import { useMutation } from "@tanstack/react-query";
import { updateFlatpak } from "@/lib/tauri-commands";
import { createLogger } from "@/lib/logger";

const logger = createLogger("flatpak-update");

export const useFlatpakUpdate = () => {
  const {
    mutateAsync: installFlatpakUpdate,
    isPending: isInstallingFlatpakUpdate,
  } = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: (url: string) => updateFlatpak(url),
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
