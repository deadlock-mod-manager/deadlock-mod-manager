import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { isTauriError } from "@/types/tauri";

export const CrosshairsToggle = ({
  compact = false,
}: {
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );
  const setCrosshairsEnabled = usePersistedStore(
    (state) => state.setCrosshairsEnabled,
  );
  const activeCrosshair = usePersistedStore((state) => state.activeCrosshair);

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!enabled) {
        return invoke("disable_custom_crosshairs");
      }
      if (activeCrosshair) {
        return invoke("apply_crosshair_to_autoexec", {
          config: activeCrosshair,
        });
      }
    },
    onSuccess: (_, enabled) => {
      setCrosshairsEnabled(enabled);
      if (!enabled) {
        toast.success(t("crosshairs.removedRestart"));
      } else if (activeCrosshair) {
        toast.success(t("crosshairs.appliedRestart"));
      }
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(error);
      if (isTauriError(error) && error.kind === "gameRunning") {
        toast.error(t("crosshairs.stopGameBeforeChange"));
        return;
      }
      toast.error(t("crosshairs.toggleError"));
    },
  });

  const handleToggle = (checked: boolean) => {
    toggleMutation.mutate(checked);
  };

  return (
    <div className='flex flex-wrap items-center justify-between gap-4'>
      <div className='min-w-0 flex-1 space-y-1'>
        <Label
          htmlFor='toggle-setting-crosshairs'
          className='font-bold text-sm'>
          {t("settings.customCrosshairs")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t(
            compact
              ? "crosshairs.toggleHint"
              : "settings.customCrosshairsDescription",
          )}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={crosshairsEnabled}
          disabled={toggleMutation.isPending}
          onCheckedChange={handleToggle}
          id='toggle-setting-crosshairs'
        />
        <Label htmlFor='toggle-setting-crosshairs'>
          {crosshairsEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
