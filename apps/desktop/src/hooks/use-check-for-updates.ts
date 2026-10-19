import { analytics } from "@/lib/analytics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import { ValidationError } from "@deadlock-mods/common/client-errors";
import {
  type AppUpdate,
  checkForAppUpdates,
  installAppUpdate,
} from "@/lib/app-updates";
import { showAppUpdateError } from "@/lib/app-update-notifications";
import { useTranslation } from "react-i18next";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { isFlatpak } from "@/lib/tauri-commands";
import { createLogger } from "@/lib/logger";
import { GC_TIME_UPDATER, STALE_TIME_UPDATER } from "@/lib/query-constants";
import { useFlatpakUpdate } from "./use-flatpak-update";

const logger = createLogger("check-for-updates");

const NATIVE_UPDATES_QUERY_KEY = ["app-updates", "native"] as const;
const IS_FLATPAK_QUERY_KEY = ["app-env", "is-flatpak"] as const;

export const useCheckForUpdates = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { installFlatpakUpdate, isInstallingFlatpakUpdate } =
    useFlatpakUpdate();

  const { data: isRunningAsFlatpak = false } = useQuery({
    queryKey: IS_FLATPAK_QUERY_KEY,
    queryFn: isFlatpak,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const {
    data: nativeUpdate,
    isLoading: isNativeLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: NATIVE_UPDATES_QUERY_KEY,
    queryFn: () => checkForAppUpdates(),
    meta: { skipGlobalErrorHandler: true },
    enabled: !isRunningAsFlatpak && !import.meta.env.DEV,
    staleTime: STALE_TIME_UPDATER,
    gcTime: GC_TIME_UPDATER,
    refetchInterval:
      isRunningAsFlatpak || import.meta.env.DEV ? false : STALE_TIME_UPDATER,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: 5000,
  });

  const updateAvailable = !!nativeUpdate && !isError;

  const { mutate: installUpdate, isPending: isInstallingUpdate } = useMutation({
    mutationFn: async () => {
      const native = queryClient.getQueryData<AppUpdate | null>(
        NATIVE_UPDATES_QUERY_KEY,
      );
      if (!native) {
        throw new ValidationError("No update available");
      }

      const attempt = analytics.start("app_update", {
        target_version: native.version,
        entry_point: "update_button",
      });
      try {
        if (isRunningAsFlatpak) {
          logger
            .withMetadata({ version: native.version })
            .info("Installing Flatpak update");
          await installAppUpdate(native, undefined, () =>
            installFlatpakUpdate(native.downloadUrl),
          );
          attempt.finish("completed");
          return;
        }

        logger
          .withMetadata({ version: native.version })
          .info("Installing native update");
        toast.loading(t("about.downloadingUpdate"));
        await installAppUpdate(native);
        logger.info("Native update installed, relaunching");
        attempt.finish("completed");
        await relaunch();
      } catch (error) {
        attempt.finish("failed");
        throw error;
      }
    },
    meta: { skipGlobalErrorHandler: true },
    onError: showAppUpdateError,
  });

  const { mutate: checkForUpdates, isPending: isCheckForUpdatesPending } =
    useMutation({
      mutationFn: async (): Promise<AppUpdate | null> => {
        return queryClient.fetchQuery({
          queryKey: NATIVE_UPDATES_QUERY_KEY,
          queryFn: () => checkForAppUpdates(),
          staleTime: 0,
          meta: { skipGlobalErrorHandler: true },
        });
      },
      onSuccess: (result) => {
        if (!result) {
          toast.info(t("about.latestVersion"));
        }
      },
      meta: { skipGlobalErrorHandler: true },
      onError: showAppUpdateError,
    });

  return {
    updateAvailable,
    isRunningAsFlatpak,
    isCheckingForUpdates: isNativeLoading || isCheckForUpdatesPending,
    isError,
    error,
    refetch,
    installUpdate,
    isInstallingUpdate: isInstallingUpdate || isInstallingFlatpakUpdate,
    checkForUpdates,
  };
};
