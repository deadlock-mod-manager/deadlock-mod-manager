import { check as checkOta } from "@crabnebula/plugin-ota-updater";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check as checkNative,
  type Update as NativeUpdate,
} from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { createLogger } from "@/lib/logger";

const logger = createLogger("check-for-updates");

const APP_UPDATES_QUERY_KEY = ["app-updates"] as const;

type OtaUpdate = Awaited<ReturnType<typeof checkOta>>;
type AppUpdatesData = {
  nativeUpdate: NativeUpdate | null;
  otaUpdate: OtaUpdate;
};

async function fetchAppUpdates(): Promise<AppUpdatesData> {
  const [nativeResult, otaResult] = await Promise.all([
    checkNative().catch((err) => {
      logger.withError(err as Error).warn("Native update check failed");
      return null;
    }),
    checkOta().catch((err) => {
      logger.withError(err as Error).warn("OTA update check failed");
      return null;
    }),
  ]);

  return { nativeUpdate: nativeResult, otaUpdate: otaResult };
}

export const useCheckForUpdates = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: isCheckingForUpdates,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: APP_UPDATES_QUERY_KEY,
    queryFn: fetchAppUpdates,
    refetchInterval: 30000,
    retry: 2,
    retryDelay: 5000,
  });

  const updateAvailable = !!data?.nativeUpdate || !!data?.otaUpdate;

  const { mutate: installUpdate, isPending: isInstallingUpdate } = useMutation({
    mutationFn: async () => {
      const updates = queryClient.getQueryData<AppUpdatesData>(
        APP_UPDATES_QUERY_KEY,
      );
      if (!updates?.nativeUpdate && !updates?.otaUpdate) {
        throw new Error("No update available");
      }

      if (updates.nativeUpdate) {
        logger
          .withMetadata({ version: updates.nativeUpdate.version })
          .info("Installing native update");
        toast.loading(t("about.downloadingUpdate"));
        await updates.nativeUpdate.downloadAndInstall(() => {});
        logger.info("Native update installed, relaunching");
        await relaunch();
        return;
      }

      if (updates.otaUpdate) {
        logger.info("Applying OTA update");
        toast.loading(t("about.downloadingUpdate"));
        await updates.otaUpdate.apply();
        logger.info("OTA update applied, reloading window");
        window.location.reload();
      }
    },
    onError: (err) => {
      logger
        .withError(err instanceof Error ? err : new Error(String(err)))
        .error("Update install failed");
      toast.error(t("about.updateFailed"));
    },
  });

  const { mutate: checkForUpdates } = useMutation({
    mutationFn: async () => {
      const result = await queryClient.fetchQuery({
        queryKey: APP_UPDATES_QUERY_KEY,
        queryFn: fetchAppUpdates,
      });
      return result;
    },
    onSuccess: (result) => {
      if (!result.nativeUpdate && !result.otaUpdate) {
        toast.info(t("about.latestVersion"));
      }
    },
    onError: (err) => {
      logger
        .withError(err instanceof Error ? err : new Error(String(err)))
        .error("Update check failed");
      toast.error(t("about.updateFailed"));
    },
  });

  return {
    updateAvailable,
    isCheckingForUpdates,
    isError,
    error,
    installUpdate,
    isInstallingUpdate,
    refetch,
    checkForUpdates,
  };
};
