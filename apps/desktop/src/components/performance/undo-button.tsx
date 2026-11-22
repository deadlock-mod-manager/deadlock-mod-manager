import {
  useApplyPerfConfig,
  useRemovePerfConfig,
} from "@/hooks/performance/use-perf-mutations";
import { applySourceFor } from "@/lib/performance/config-list";
import { undoTarget } from "@/lib/performance/history";
import { usePersistedStore } from "@/lib/store";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const useUndoLastChange = (currentConfigId: string | null) => {
  const history = usePersistedStore((state) => state.perfHistory);
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const applyMutation = useApplyPerfConfig();
  const removeMutation = useRemovePerfConfig();
  const target = undoTarget(history, currentConfigId, userConfigs);

  const undo = () => {
    if (!target) return;
    if (target.kind === "remove") {
      removeMutation.mutate({ entryPoint: "undo" });
      return;
    }
    applyMutation.mutate({
      request: target.request,
      source: applySourceFor(target.request.configId, userConfigs),
      entryPoint: "undo",
    });
  };

  return {
    available: target !== null,
    undo,
    isPending: applyMutation.isPending || removeMutation.isPending,
  };
};

export const UndoButton = ({
  currentConfigId,
  compact = false,
}: {
  currentConfigId: string | null;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const { available, undo, isPending } = useUndoLastChange(currentConfigId);
  if (!available) return null;

  return (
    <Button
      icon={<ArrowCounterClockwiseIcon aria-hidden />}
      isLoading={isPending}
      onClick={undo}
      size='sm'
      variant='ghost'>
      {compact
        ? t("performance.activeStatus.undoShort")
        : t("performance.activeStatus.undo")}
    </Button>
  );
};
