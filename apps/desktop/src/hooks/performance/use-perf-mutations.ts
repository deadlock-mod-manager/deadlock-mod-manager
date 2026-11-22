import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { analytics } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import type {
  AnalyticsEvents,
  AnalyticsOperations,
} from "@/lib/analytics/schema";
import { getErrorMessage } from "@/lib/errors";
import { isGameRunningError } from "@/lib/game-guard";
import logger from "@/lib/logger";
import {
  adoptVideo,
  applyPerfConfig,
  keepVideoValues,
  removePerfConfig,
  restoreVideoBackup,
  writeConfigVideoValues,
} from "@/lib/performance/api";
import { applySourceFor } from "@/lib/performance/config-list";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { presetIdFromConfigId } from "@/lib/performance/request";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";
import { isTauriError } from "@/types/tauri";
import type { CatalogSummary } from "@/types/generated/CatalogSummary";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PerfApplyResult } from "@/types/generated/PerfApplyResult";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import type { VideoOutcome } from "@/types/generated/VideoOutcome";
import { refreshPerfCatalogNow } from "./use-perf-queries";

const APPLIED_TOAST_ID = "performance-config-applied";

type ApplyStart = AnalyticsOperations["performance_config_apply"]["start"];

type ApplyPerfConfigVariables = {
  request: PerfApplyRequest;
  removeForeign?: boolean;
  source: ApplyStart["source"];
  entryPoint: ApplyStart["entry_point"];
  notify?: boolean;
};

type RemovePerfConfigVariables = {
  entryPoint: AnalyticsEvents["performance_config_removed"]["entry_point"];
};

export const useRefreshPerfCatalog = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<{ version: string; updated: boolean }, Error>({
    mutationFn: async () => {
      const previous = queryClient.getQueryData<CatalogSummary>(
        perfQueryKeys.catalog(),
      )?.version;
      const { version } = await refreshPerfCatalogNow(queryClient);
      return { version, updated: version !== previous };
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: ({ version, updated }) => {
      toast.success(
        updated
          ? t("performance.toasts.catalogUpdated", { version })
          : t("performance.toasts.catalogUpToDate"),
      );
    },
    onError: (error) => {
      logger.withError(error).warn("Performance catalog refresh failed");
      toast.error(t("performance.toasts.catalogRefreshFailed"));
    },
  });
};

export const useRemovePerfConfig = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const recordPerfHistory = usePersistedStore(
    (state) => state.recordPerfHistory,
  );

  return useMutation<PerfStatus, Error, RemovePerfConfigVariables>({
    mutationFn: () => removePerfConfig(),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (status, { entryPoint }) => {
      analytics.track("performance_config_removed", {
        entry_point: entryPoint,
      });
      recordPerfHistory({
        action: "removed",
        configId: null,
        name: null,
        request: null,
        appliedCount: null,
        videoCount: null,
      });
      queryClient.setQueryData(perfQueryKeys.status(), status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
      toast.dismiss(APPLIED_TOAST_ID);
      toast.success(t("performance.toasts.removed"));
    },
    onError: (error, { entryPoint }) => {
      if (isGameRunningError(error)) return;
      logger.withError(error).error("Removing performance config failed");
      toast.error(
        entryPoint === "undo"
          ? t("performance.toasts.undoFailed")
          : t("performance.toasts.removeFailed"),
      );
    },
  });
};

export const useRestoreVideoBackup = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setPerfVideoChoice = usePersistedStore(
    (state) => state.setPerfVideoChoice,
  );
  const recordPerfHistory = usePersistedStore(
    (state) => state.recordPerfHistory,
  );

  return useMutation<PerfStatus, Error>({
    mutationFn: () => restoreVideoBackup(),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (status) => {
      recordPerfHistory({ action: "videoRestored" });
      const request = status.desired?.request;
      if (request) {
        setPerfVideoChoice(request.configId, {
          write: request.writeVideo,
          variant: request.videoVariant,
        });
      }
      queryClient.setQueryData(perfQueryKeys.status(), status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
      toast.success(t("performance.toasts.videoRestored"));
    },
    onError: (error) => {
      if (isGameRunningError(error)) return;
      logger.withError(error).error("Restoring video.txt failed");
      toast.error(t("performance.toasts.videoRestoreFailed"), {
        description: getErrorMessage(error),
      });
    },
  });
};

export const useAdoptVideo = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setPerfVideoChoice = usePersistedStore(
    (state) => state.setPerfVideoChoice,
  );
  const recordPerfHistory = usePersistedStore(
    (state) => state.recordPerfHistory,
  );

  return useMutation<PerfStatus, Error>({
    mutationFn: () => adoptVideo(),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (status) => {
      recordPerfHistory({ action: "videoAdopted" });
      const request = status.desired?.request;
      if (request) {
        setPerfVideoChoice(request.configId, {
          write: request.writeVideo,
          variant: request.videoVariant,
        });
      }
      queryClient.setQueryData(perfQueryKeys.status(), status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
      toast.success(t("performance.toasts.videoAdopted"));
    },
    onError: (error) => {
      logger.withError(error).error("Adopting video.txt failed");
      toast.error(t("performance.toasts.videoAdoptFailed"), {
        description: getErrorMessage(error),
      });
    },
  });
};

export const useApplyPerfConfig = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const recordPerfHistory = usePersistedStore(
    (state) => state.recordPerfHistory,
  );
  const setPerfOverrides = usePersistedStore((state) => state.setPerfOverrides);
  const setPerfIncludeEngineSections = usePersistedStore(
    (state) => state.setPerfIncludeEngineSections,
  );
  const setPerfVideoChoice = usePersistedStore(
    (state) => state.setPerfVideoChoice,
  );
  const { mutate: removeConfig } = useRemovePerfConfig();

  const videoNote = (video: VideoOutcome) => {
    if (video.kind === "written") {
      return t("performance.toasts.videoWritten", { count: video.settings });
    }
    if (video.kind === "fileMissing")
      return t("performance.toasts.videoMissing");
    return null;
  };

  const mutation = useMutation<
    PerfApplyResult,
    Error,
    ApplyPerfConfigVariables,
    PerfStatus | undefined
  >({
    mutationFn: async ({ request, removeForeign, source, entryPoint }) => {
      const attempt = analytics.start("performance_config_apply", {
        source,
        preset_id: presetIdFromConfigId(request.configId) ?? undefined,
        entry_point: entryPoint,
        include_engine_sections: request.includeEngineSections,
      });
      try {
        const result = await applyPerfConfig(request, removeForeign);
        attempt.finish("completed", {
          applied_count: result.resolved.counts.applies,
        });
        return result;
      } catch (error) {
        attempt.finish(
          failureOutcome(isTauriError(error) ? error.kind : undefined),
        );
        throw error;
      }
    },
    meta: { skipGlobalErrorHandler: true },
    onMutate: () =>
      queryClient.getQueryData<PerfStatus>(perfQueryKeys.status()),
    onSuccess: (result, { request, notify = true }, previous) => {
      setPerfOverrides(request.configId, request.overrides);
      setPerfIncludeEngineSections(
        request.configId,
        request.includeEngineSections,
      );
      setPerfVideoChoice(request.configId, {
        write: request.writeVideo,
        variant: request.videoVariant,
      });
      recordPerfHistory({
        action: "applied",
        configId: request.configId,
        name: request.name,
        request,
        appliedCount: result.resolved.counts.applies,
        videoCount:
          result.video.kind === "written" ? result.video.settings : null,
      });
      queryClient.setQueryData(perfQueryKeys.status(), result.status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
      if (!notify) {
        toast.dismiss(APPLIED_TOAST_ID);
        return;
      }
      const previousRequest = previous?.desired?.request ?? null;
      void isGameRunning()
        .catch(() => false)
        .then((gameRunning) => {
          const count = result.resolved.counts.applies;
          const video = videoNote(result.video);
          const written = gameRunning
            ? t("performance.toasts.restartToUse", { count })
            : t("performance.toasts.nextLaunch", { count });
          toast.success(
            t("performance.toasts.applied", { name: request.name }),
            {
              id: APPLIED_TOAST_ID,
              duration: 8000,
              description: video ? `${written} ${video}` : written,
              action: {
                label: t("performance.toasts.undo"),
                onClick: () => undo(previousRequest),
              },
            },
          );
        });
    },
    onError: (error, { entryPoint }) => {
      if (isGameRunningError(error)) return;
      logger.withError(error).error("Applying performance config failed");
      toast.error(
        entryPoint === "undo"
          ? t("performance.toasts.undoFailed")
          : t("performance.toasts.applyFailed"),
        { description: getErrorMessage(error) },
      );
    },
  });

  const undo = (previousRequest: PerfApplyRequest | null): void => {
    if (!previousRequest) {
      removeConfig({ entryPoint: "undo" });
      return;
    }
    mutation.mutate({
      request: previousRequest,
      source: applySourceFor(
        previousRequest.configId,
        usePersistedStore.getState().perfUserConfigs,
      ),
      entryPoint: "undo",
      notify: false,
    });
  };

  return mutation;
};

type VideoChoice = "useConfig" | "keep";

export const useResolveVideoChanges = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const recordPerfHistory = usePersistedStore(
    (state) => state.recordPerfHistory,
  );

  return useMutation<
    PerfStatus,
    Error,
    { choice: VideoChoice; keys: string[] }
  >({
    mutationFn: ({ choice, keys }) =>
      choice === "useConfig"
        ? writeConfigVideoValues(keys)
        : keepVideoValues(keys),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (status, { choice, keys }) => {
      recordPerfHistory({
        action: choice === "useConfig" ? "videoReverted" : "videoKept",
        keys,
      });
      queryClient.setQueryData(perfQueryKeys.status(), status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
    },
    onError: (error) => {
      if (isGameRunningError(error)) return;
      logger.withError(error).error("Settling video.txt changes failed");
      toast.error(t("performance.video.changes.failed"), {
        description: getErrorMessage(error),
      });
    },
  });
};
