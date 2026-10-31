import { useApplyPerfConfig } from "@/hooks/performance/use-perf-mutations";
import { applySourceFor } from "@/lib/performance/config-list";
import { usePersistedStore } from "@/lib/store";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import type { ForeignOverlay } from "@/types/generated/ForeignOverlay";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useTranslation } from "react-i18next";
import { Notice } from "./notice";

export const ForeignOverlayNotices = ({
  foreign,
  desired,
}: {
  foreign: ForeignOverlay[];
  desired: DesiredOverlay;
}) => {
  const { t } = useTranslation();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const applyMutation = useApplyPerfConfig();

  const replace = () =>
    applyMutation.mutate(
      {
        request: desired.request,
        removeForeign: true,
        source: applySourceFor(desired.request.configId, userConfigs),
        entryPoint: "reapply",
        notify: false,
      },
      {
        onSuccess: (result) => {
          if (result.removedForeign.length === 0) return;
          toast.success(
            t("performance.activeStatus.foreignReplaced", {
              count: result.removedForeign.length,
            }),
          );
        },
      },
    );

  return foreign.map((overlay) => (
    <Notice
      action={
        <Button
          isLoading={applyMutation.isPending}
          onClick={replace}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.replaceForeign")}
        </Button>
      }
      key={`${overlay.tool}-${overlay.label ?? ""}`}>
      {overlay.label
        ? t("performance.activeStatus.foreignAlsoLabelled", {
            tool: t(`performance.foreignTools.${overlay.tool}`),
            label: overlay.label,
          })
        : t("performance.activeStatus.foreignAlso", {
            tool: t(`performance.foreignTools.${overlay.tool}`),
          })}
    </Notice>
  ));
};
