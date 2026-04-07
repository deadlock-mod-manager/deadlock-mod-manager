import { check as checkOta } from "@crabnebula/plugin-ota-updater";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check as checkNative,
  type Update as NativeUpdate,
} from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { isFlatpak } from "@/lib/api";
import { GITHUB_REPO } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import {
  GC_TIME_UPDATER,
  STALE_TIME_MANUAL_CHECK,
  STALE_TIME_UPDATER,
} from "@/lib/query-constants";
import { useFlatpakUpdate } from "./use-flatpak-update";

const logger = createLogger("check-for-updates");

const NATIVE_UPDATES_QUERY_KEY = ["app-updates", "native"] as const;
const OTA_UPDATES_QUERY_KEY = ["app-updates", "ota"] as const;
const IS_FLATPAK_QUERY_KEY = ["app-env", "is-flatpak"] as const;

type OtaUpdate = Awaited<ReturnType<typeof checkOta>>;

async function fetchNativeUpdate(): Promise<NativeUpdate | null> {
  return checkNative().catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.withError(error).warn("Native update check failed");
    return null;
  });
}

async function fetchOtaUpdate(): Promise<OtaUpdate | null> {
  return checkOta().catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.withError(error).warn("OTA update check failed");
    return null;
  });
}

type AppUpdatesData = {
  nativeUpdate: NativeUpdate | null;
  otaUpdate: OtaUpdate | null;
};

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
    enabled: true,
    staleTime: STALE_TIME_UPDATER,
    gcTime: GC_TIME_UPDATER,
    refetchInterval: STALE_TIME_UPDATER,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: 5000,
  });

  const { data: otaUpdate } = useQuery({
    queryKey: OTA_UPDATES_QUERY_KEY,
    queryFn: fetchOtaUpdate,
    enabled: false,
    staleTime: STALE_TIME_MANUAL_CHECK,
    gcTime: GC_TIME_UPDATER,
  });

  const updateAvailable = !!nativeUpdate || !!otaUpdate;

  const { mutate: installUpdate, isPending: isInstallingUpdate } = useMutation({
    mutationFn: async () => {
      const native = queryClient.getQueryData<NativeUpdate | null>(
        NATIVE_UPDATES_QUERY_KEY,
      );
      const ota = queryClient.getQueryData<OtaUpdate | null>(
        OTA_UPDATES_QUERY_KEY,
      );
      if (!native && !ota) {
        throw new Error("No update available");
      }

      if (native && isRunningAsFlatpak) {
        const flatpakUrl = `${GITHUB_REPO}/releases/download/v${native.version}/deadlock-mod-manager.flatpak`;
        logger
          .withMetadata({ version: native.version })
          .info("Installing Flatpak update");
        installFlatpakUpdate(flatpakUrl);
        return;
      }

      if (native && !isRunningAsFlatpak) {
        logger
          .withMetadata({ version: native.version })
          .info("Installing native update");
        toast.loading(t("about.downloadingUpdate"));
        await native.downloadAndInstall(() => {});
        logger.info("Native update installed, relaunching");
        await relaunch();
        return;
      }

      if (ota) {
        logger.info("Applying OTA update");
        toast.loading(t("about.downloadingUpdate"));
        await ota.apply();
        logger.info("OTA update applied, reloading window");
        window.location.reload();
      }
    },
    onError: (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.withError(error).error("Update install failed");
      toast.error(`${t("about.updateFailed")}: ${error.message}`);
    },
  });

  const { mutate: checkForUpdates, isPending: isCheckForUpdatesPending } =
    useMutation({
      mutationFn: async (): Promise<AppUpdatesData> => {
        const [nativeResult, otaResult] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: NATIVE_UPDATES_QUERY_KEY,
            queryFn: fetchNativeUpdate,
            staleTime: STALE_TIME_MANUAL_CHECK,
          }),
          queryClient.fetchQuery({
            queryKey: OTA_UPDATES_QUERY_KEY,
            queryFn: fetchOtaUpdate,
            staleTime: STALE_TIME_MANUAL_CHECK,
          }),
        ]);
        return { nativeUpdate: nativeResult, otaUpdate: otaResult };
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
    isRunningAsFlatpak,
    isCheckingForUpdates: isNativeLoading || isCheckForUpdatesPending,
    isError,
    error,
    refetch,
    installUpdate,
    isInstallingUpdate: isInstallingUpdate || isInstallingFlatpakUpdate,
    installFlatpakUpdate,
    checkForUpdates,
  };
};
