import { useMutation, useQuery } from "@tanstack/react-query";
import { check } from "@crabnebula/plugin-ota-updater";
import { createLogger } from "@/lib/logger";
import { toast } from "@deadlock-mods/ui/components/sonner";

const logger = createLogger("ota-updates");

export const useOtaUpdates = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ota-updates"],
    queryFn: () => {
      return check();
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: 2,
    retryDelay: 5000,
  });

  const { mutate: installUpdate, isPending: isInstallingUpdate } = useMutation({
    mutationFn: () => {
      if (!data) {
        throw new Error("No update available");
      }
      return data.apply();
    },
    onSuccess: () => {
      logger.info("OTA update installed, reloading window");
      window.location.reload();
    },
    onError: (error) => {
      logger.withError(error).error("Failed to install update");
      toast.error("Failed to install OTA update");
    },
  });

  return {
    otaUpdateAvailable: !!data,
    isCheckingForUpdates: isLoading,
    isError: isError,
    error: error,
    installUpdate,
    isInstallingUpdate,
  };
};
