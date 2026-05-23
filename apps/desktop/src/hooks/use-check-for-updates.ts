import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check as checkNative,
  type Update as NativeUpdate,
} from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { isFlatpak } from "@/lib/tauri-commands";
import { GITHUB_REPO } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import {
  GC_TIME_UPDATER,
  STALE_TIME_MANUAL_CHECK,
  STALE_TIME_UPDATER,
} from "@/lib/query-constants";
import { useFlatpakUpdate } from "./use-flatpak-update";

const logger = createLogger("check-for-updates");

const buildFlatpakReleaseUrl = (version: string) =>
  `${GITHUB_REPO}/releases/download/v${version}/deadlock-mod-manager.flatpak`;

const NATIVE_UPDATES_QUERY_KEY = ["app-updates", "native"] as const;
const IS_FLATPAK_QUERY_KEY = ["app-env", "is-flatpak"] as const;

async function fetchNativeUpdate(): Promise<NativeUpdate | null> {
  return checkNative().catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.withError(error).warn("Native update check failed");
    return null;
  });
}

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
    queryFn: fetchNativeUpdate,
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

  const updateAvailable = !!nativeUpdate;

  const { mutate: installUpdate, isPending: isInstallingUpdate } = useMutation({
    mutationFn: async () => {
      const native = queryClient.getQueryData<NativeUpdate | null>(
        NATIVE_UPDATES_QUERY_KEY,
      );
      if (!native) {
        throw new Error("No update available");
      }

      if (isRunningAsFlatpak) {
        const flatpakUrl = buildFlatpakReleaseUrl(native.version);
        logger
          .withMetadata({ version: native.version })
          .info("Installing Flatpak update");
        await installFlatpakUpdate(flatpakUrl);
        return;
      }

      logger
        .withMetadata({ version: native.version })
        .info("Installing native update");
      toast.loading(t("about.downloadingUpdate"));
      await native.downloadAndInstall(() => {});
      logger.info("Native update installed, relaunching");
      await relaunch();
    },
    onError: (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.withError(error).error("Update install failed");
      toast.error(`${t("about.updateFailed")}: ${error.message}`);
    },
  });

  const { mutate: checkForUpdates, isPending: isCheckForUpdatesPending } =
    useMutation({
      mutationFn: async (): Promise<NativeUpdate | null> => {
        return queryClient.fetchQuery({
          queryKey: NATIVE_UPDATES_QUERY_KEY,
          queryFn: fetchNativeUpdate,
          staleTime: STALE_TIME_MANUAL_CHECK,
        });
      },
      onSuccess: (result) => {
        if (!result) {
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
