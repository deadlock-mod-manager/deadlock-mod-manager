import { RuntimeError } from "@deadlock-mods/common";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check as checkNative,
  type Update as NativeUpdate,
} from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import { GITHUB_REPO } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import {
  GC_TIME_UPDATER,
  STALE_TIME_MANUAL_CHECK,
  STALE_TIME_UPDATER,
} from "@/lib/query-constants";
import { getUpdateTarget } from "@/lib/tauri-commands";
import {
  buildExactUpdateCheckOptions,
  checkExactUpdate,
  installExactUpdate,
  type UpdateCheckOutcome,
} from "@/lib/update-check";
import { useFlatpakUpdate } from "./use-flatpak-update";

const logger = createLogger("check-for-updates");

const buildFlatpakReleaseUrl = (
  channel: "stable" | "nightly",
  version: string,
  asset: string,
) => {
  const releaseTag = channel === "nightly" ? "nightly" : `v${version}`;
  return `${GITHUB_REPO}/releases/download/${releaseTag}/${asset}`;
};

const UPDATE_TARGET_QUERY_KEY = ["app-env", "update-target"] as const;
const nativeUpdatesQueryKey = (manifestTarget: string) =>
  ["app-updates", manifestTarget] as const;

async function fetchUpdateOutcome(
  manifestTarget: string,
): Promise<UpdateCheckOutcome<NativeUpdate>> {
  try {
    const outcome = await checkExactUpdate(manifestTarget, (target) =>
      checkNative(buildExactUpdateCheckOptions(target)),
    );
    if (outcome.kind === "targetUnavailable") {
      logger
        .withMetadata({ manifestTarget })
        .warn("No update artifact exists for the exact target");
    }
    return outcome;
  } catch (error) {
    logger
      .withMetadata({ manifestTarget })
      .withError(error)
      .warn("Update check failed");
    throw error;
  }
}

export const useCheckForUpdates = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { installFlatpakUpdate, isInstallingFlatpakUpdate } =
    useFlatpakUpdate();

  const { data: updateTarget, isLoading: isUpdateTargetLoading } = useQuery({
    queryKey: UPDATE_TARGET_QUERY_KEY,
    queryFn: getUpdateTarget,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const nativeUpdateQueryKey = updateTarget
    ? nativeUpdatesQueryKey(updateTarget.manifestTarget)
    : nativeUpdatesQueryKey("unresolved");
  const isRunningAsFlatpak = updateTarget?.installer === "flatpak";

  const {
    data: updateOutcome,
    isLoading: isNativeLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: nativeUpdateQueryKey,
    queryFn:
      updateTarget && !import.meta.env.DEV
        ? () => fetchUpdateOutcome(updateTarget.manifestTarget)
        : skipToken,
    staleTime: STALE_TIME_UPDATER,
    gcTime: GC_TIME_UPDATER,
    refetchInterval:
      updateTarget?.installationStrategy === "native"
        ? STALE_TIME_UPDATER
        : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: 5000,
  });

  const nativeUpdate =
    updateOutcome?.kind === "available" ? updateOutcome.update : null;
  const updateAvailable = nativeUpdate !== null;

  const { mutate: installUpdate, isPending: isInstallingUpdate } = useMutation({
    mutationFn: async () => {
      if (!updateTarget) {
        throw new RuntimeError("Update target has not been resolved");
      }

      const outcome = queryClient.getQueryData<
        UpdateCheckOutcome<NativeUpdate>
      >(nativeUpdatesQueryKey(updateTarget.manifestTarget));
      if (outcome?.kind !== "available") {
        throw new RuntimeError("No update available");
      }
      const native = outcome.update;

      if (updateTarget.installationStrategy === "packageManager") {
        logger
          .withMetadata({ installer: updateTarget.installer })
          .info("Deferring update installation to the package manager");
        toast.info(
          t("update.installWithPackageManager", {
            installer: updateTarget.installer,
          }),
        );
        return;
      }

      if (updateTarget.installationStrategy === "unsupported") {
        toast.info(t("update.manualInstallRequired"));
        return;
      }

      if (updateTarget.installationStrategy === "flatpak") {
        if (!updateTarget.flatpakAsset) {
          throw new RuntimeError("Flatpak update asset has not been resolved");
        }

        const flatpakUrl = buildFlatpakReleaseUrl(
          updateTarget.channel,
          native.version,
          updateTarget.flatpakAsset,
        );
        logger
          .withMetadata({
            version: native.version,
            runtime: updateTarget.runtime,
            asset: updateTarget.flatpakAsset,
          })
          .info("Installing Flatpak update");
        await installExactUpdate(() => installFlatpakUpdate(flatpakUrl));
        return;
      }

      logger
        .withMetadata({
          version: native.version,
          manifestTarget: updateTarget.manifestTarget,
        })
        .info("Installing native update");
      toast.loading(t("about.downloadingUpdate"));
      await installExactUpdate(() => native.downloadAndInstall(() => {}));
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
      mutationFn: async (): Promise<UpdateCheckOutcome<NativeUpdate>> => {
        const target = await queryClient.fetchQuery({
          queryKey: UPDATE_TARGET_QUERY_KEY,
          queryFn: getUpdateTarget,
          staleTime: Infinity,
        });

        return queryClient.fetchQuery({
          queryKey: nativeUpdatesQueryKey(target.manifestTarget),
          queryFn: () => fetchUpdateOutcome(target.manifestTarget),
          staleTime: STALE_TIME_MANUAL_CHECK,
        });
      },
      onSuccess: (outcome) => {
        if (outcome.kind === "noUpdate") {
          toast.info(t("about.latestVersion"));
        } else if (outcome.kind === "targetUnavailable") {
          toast.warning(
            t("update.targetUnavailable", {
              runtime: updateTarget?.runtime ?? "unknown",
              installer: updateTarget?.installer ?? "unknown",
            }),
          );
        }
      },
      onError: (err) => {
        logger
          .withError(err instanceof Error ? err : new Error(String(err)))
          .error("Update check failed");
        toast.error(
          t("update.checkFailedForTarget", {
            channel: updateTarget?.channel ?? "unknown",
            runtime: updateTarget?.runtime ?? "unknown",
            installer: updateTarget?.installer ?? "unknown",
          }),
        );
      },
    });

  return {
    updateAvailable,
    isRunningAsFlatpak,
    isCheckingForUpdates:
      isUpdateTargetLoading || isNativeLoading || isCheckForUpdatesPending,
    isError,
    error,
    refetch,
    installUpdate,
    isInstallingUpdate: isInstallingUpdate || isInstallingFlatpakUpdate,
    checkForUpdates,
  };
};
