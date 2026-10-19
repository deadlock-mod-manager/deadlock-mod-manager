import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { useCompatibilityReview } from "@/components/providers/compatibility-review";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import {
  mergeHealthChecks,
  type ModHealthCheckRequest,
} from "@/lib/mods/mod-health";
import {
  forcedBuildStorageKey,
  invalidateModHealth,
  modHealthQueryKey,
} from "@/lib/mods/mod-health-queries";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";
import type { FixModsResult } from "@/types/generated/FixModsResult";
import type { ModHealthProgress } from "@/types/generated/ModHealthProgress";
import type { ModHealthReport } from "@/types/generated/ModHealthReport";

const MOD_HEALTH_CHECK_KEY = ["mod-health-check"];

export const useModHealthProgress = create<{
  progress: ModHealthProgress | null;
  setProgress: (progress: ModHealthProgress | null) => void;
}>()((set) => ({
  progress: null,
  setProgress: (progress) => set({ progress }),
}));

export const useActiveProfileFolder = () =>
  usePersistedStore(
    (state) => state.profiles[state.activeProfileId]?.folderName ?? null,
  );

export const useModHealthReport = (profileFolder: string | null) => {
  const gamePath = usePersistedStore((state) => state.gamePath);
  return useQuery({
    queryKey: modHealthQueryKey(profileFolder),
    queryFn: () => invoke<ModHealthReport>("get_mod_health", { profileFolder }),
    enabled: !!gamePath,
    staleTime: 30_000,
    meta: { skipGlobalErrorHandler: true },
  });
};

export const useGameRunning = () => {
  const gamePath = usePersistedStore((state) => state.gamePath);
  // useHeroDetection already polls this key every 5s; a second interval here
  // would drift out of phase and double the process scans.
  const game = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    enabled: !!gamePath,
    staleTime: 5000,
  });
  return !!game.data;
};

export const useIsCheckingModHealth = () =>
  useIsMutating({ mutationKey: MOD_HEALTH_CHECK_KEY }) > 0;

let queuedCheck: ModHealthCheckRequest | null = null;

export const useCheckModHealth = () => {
  const queryClient = useQueryClient();
  const mutateRef = useRef<(input: ModHealthCheckRequest) => void>(() => {});
  const mutation = useMutation({
    mutationKey: MOD_HEALTH_CHECK_KEY,
    mutationFn: ({ profileFolder, modIds, force }: ModHealthCheckRequest) =>
      invoke<ModHealthReport>("check_mod_health", {
        profileFolder,
        modIds,
        force,
      }),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (report, { profileFolder, force }) => {
      queryClient.setQueryData(modHealthQueryKey(profileFolder), report);
      if (force && report.gameBuild !== null) {
        window.localStorage.setItem(
          forcedBuildStorageKey(profileFolder),
          String(report.gameBuild),
        );
      }
    },
    onError: (error) => {
      logger.withError(error).error("Mod health check failed");
    },
    onSettled: () => {
      useModHealthProgress.getState().setProgress(null);
      const next = queuedCheck;
      queuedCheck = null;
      if (next) mutateRef.current(next);
    },
  });
  mutateRef.current = mutation.mutate;

  // One check runs at a time; requests made meanwhile merge into the next.
  return useCallback(
    ({
      profileFolder,
      modIds = null,
      force = false,
    }: Partial<ModHealthCheckRequest> & { profileFolder: string | null }) => {
      if (!usePersistedStore.getState().gamePath) return;
      const request = { profileFolder, modIds, force };
      if (queryClient.isMutating({ mutationKey: MOD_HEALTH_CHECK_KEY }) > 0) {
        queuedCheck = mergeHealthChecks(queuedCheck, request);
        return;
      }
      mutateRef.current(request);
    },
    [queryClient],
  );
};

type FixModsOutcome = "applied" | "reviewed" | "cancelled";

export const fixMods = async (
  profileFolder: string | null,
  modIds: string[],
  review: (profileFolder: string | null) => Promise<boolean>,
): Promise<FixModsOutcome> => {
  const result = await invoke<FixModsResult>("fix_mods", {
    profileFolder,
    modIds,
  });
  if (result.status === "applied") return "applied";
  return (await review(profileFolder)) ? "reviewed" : "cancelled";
};

export const useFixMods = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const reviewCompatibility = useCompatibilityReview();

  return useMutation({
    mutationFn: ({
      profileFolder,
      modIds,
    }: {
      profileFolder: string | null;
      modIds: string[];
    }) =>
      fixMods(profileFolder, modIds, (folder) =>
        reviewCompatibility(folder, { launchAfterApply: false }),
      ),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (outcome, { modIds }) => {
      // The review dialog confirms its own apply, so only the direct path
      // needs a toast here.
      if (outcome === "applied") {
        toast.success(t("modHealth.fixedToast", { count: modIds.length }));
      }
    },
    onError: (error) => {
      logger.withError(error).error("Could not fix mods");
      toast.error(t("modHealth.fixFailed"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => invalidateModHealth(queryClient),
  });
};

export const useRestoreOriginalFiles = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      profileFolder,
      modId,
    }: {
      profileFolder: string | null;
      modId: string;
      modName: string;
    }) =>
      invoke<void>("set_mod_compatibility_for_mod", {
        modId,
        enabled: false,
        profileFolder,
      }),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (_, { modName }) => {
      toast.success(t("modHealth.originalFilesToast", { name: modName }));
    },
    onError: (error) => {
      logger.withError(error).error("Could not switch a mod to its originals");
      toast.error(t("modHealth.originalFilesFailed"), {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => invalidateModHealth(queryClient),
  });
};
