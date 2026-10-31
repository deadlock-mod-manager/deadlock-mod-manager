import { analytics } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import { getErrorMessage } from "@/lib/errors";
import { isGameRunningError } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { reapplyPerfConfig } from "@/lib/performance/api";
import { applySourceFor } from "@/lib/performance/config-list";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { presetIdFromConfigId } from "@/lib/performance/request";
import { usePersistedStore } from "@/lib/store";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import { isTauriError } from "@/types/tauri";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Notice } from "./notice";

const useReapplyPerfConfig = ({ request }: DesiredOverlay) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);

  return useMutation<PerfStatus, Error>({
    mutationFn: async () => {
      const attempt = analytics.start("performance_config_apply", {
        source: applySourceFor(request.configId, userConfigs),
        preset_id: presetIdFromConfigId(request.configId) ?? undefined,
        entry_point: "reapply",
        include_engine_sections: request.includeEngineSections,
      });
      try {
        const status = await reapplyPerfConfig();
        attempt.finish("completed", {
          applied_count: status.desired?.counts.applies,
        });
        return status;
      } catch (error) {
        attempt.finish(
          failureOutcome(isTauriError(error) ? error.kind : undefined),
        );
        throw error;
      }
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (status) => {
      queryClient.setQueryData(perfQueryKeys.status(), status);
      queryClient.invalidateQueries({ queryKey: perfQueryKeys.all });
      toast.success(t("performance.activeStatus.reapplied"));
    },
    onError: (error) => {
      if (isGameRunningError(error)) return;
      logger.withError(error).error("Re-applying performance config failed");
      toast.error(t("performance.activeStatus.reapplyFailed"), {
        description: getErrorMessage(error),
      });
    },
  });
};

export const SyncNotice = ({
  status,
  desired,
}: {
  status: PerfStatus;
  desired: DesiredOverlay;
}) => {
  const { t } = useTranslation();
  const reapplyMutation = useReapplyPerfConfig(desired);
  const handEdited = status.applied?.handEdited ?? [];
  if (status.inSync && handEdited.length === 0) return null;

  const reapplyButton = (
    <Button
      icon={<ArrowsClockwiseIcon aria-hidden />}
      isLoading={reapplyMutation.isPending}
      onClick={() => reapplyMutation.mutate()}
      size='sm'
      variant='outline'>
      {t("performance.activeStatus.reapply")}
    </Button>
  );

  if (handEdited.length > 0) {
    return (
      <Notice action={reapplyButton}>
        {t("performance.activeStatus.handEdited", {
          count: handEdited.length,
          keys: handEdited
            .slice(0, 3)
            .map((path) => path[path.length - 1])
            .join(", "),
        })}
      </Notice>
    );
  }

  return (
    <Notice action={reapplyButton}>
      {status.applied === null
        ? t("performance.activeStatus.notInFile")
        : t("performance.activeStatus.outOfDate")}
    </Notice>
  );
};
