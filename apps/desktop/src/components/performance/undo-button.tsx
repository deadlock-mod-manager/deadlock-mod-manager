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

export const UndoButton = ({
  currentConfigId,
}: {
  currentConfigId: string | null;
}) => {
  const { t } = useTranslation();
  const history = usePersistedStore((state) => state.perfHistory);
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const applyMutation = useApplyPerfConfig();
  const removeMutation = useRemovePerfConfig();
  const target = undoTarget(history, currentConfigId, userConfigs);
  if (!target) return null;

  const undo = () => {
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

  return (
    <Button
      icon={<ArrowCounterClockwiseIcon aria-hidden />}
      isLoading={applyMutation.isPending || removeMutation.isPending}
      onClick={undo}
      size='sm'
      variant='ghost'>
      {t("performance.activeStatus.undo")}
    </Button>
  );
};
