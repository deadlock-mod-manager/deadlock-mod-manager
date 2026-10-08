import { Button } from "@deadlock-mods/ui/components/button";
import { CheckIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useStoredRequestOptions } from "@/hooks/performance/use-perf-config-list";
import { useApplyPerfConfig } from "@/hooks/performance/use-perf-mutations";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import {
  type ApplicableConfig,
  applicableConfigId,
  applyRequestFor,
  applySourceFor,
} from "@/lib/performance/config-list";
import { sameApplyOptions } from "@/lib/performance/overrides";
import { usePersistedStore } from "@/lib/store";

type ApplyConfigButtonProps = {
  config: ApplicableConfig;
  entryPoint: "card" | "details";
  size?: "sm" | "default";
};

/**
 * Applies a config with the user's saved tweaks for it. Shows "Applied" for
 * the active config, or "Apply changes" when its tweaks changed since.
 */
export const ApplyConfigButton = ({
  config,
  entryPoint,
  size = "sm",
}: ApplyConfigButtonProps) => {
  const { t } = useTranslation();
  const configId = applicableConfigId(config);
  const options = useStoredRequestOptions(configId);
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const { data: status } = usePerfStatus();
  const applyMutation = useApplyPerfConfig();

  const desired = status?.desired ?? null;
  const isActive = desired?.request.configId === configId;
  const hasChanges =
    isActive && desired !== null && !sameApplyOptions(desired.request, options);
  const gameUnavailable =
    status !== undefined && (!status.gamePathSet || !status.gameinfoFound);

  if (isActive && !hasChanges) {
    return (
      <span className='inline-flex h-8 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 font-medium text-primary text-xs'>
        <CheckIcon aria-hidden className='size-3.5' weight='bold' />
        {t("performance.configs.applied")}
      </span>
    );
  }

  return (
    <Button
      disabled={gameUnavailable}
      icon={<CheckIcon aria-hidden weight='bold' />}
      isLoading={applyMutation.isPending}
      onClick={() =>
        applyMutation.mutate({
          request: applyRequestFor(config, options),
          source: applySourceFor(configId, userConfigs),
          entryPoint,
        })
      }
      size={size}
      variant={entryPoint === "details" ? "default" : "outline"}>
      {hasChanges
        ? t("performance.configs.applyChanges")
        : t("performance.configs.apply")}
    </Button>
  );
};
