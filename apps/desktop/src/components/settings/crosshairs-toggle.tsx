import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const CrosshairsToggle = () => {
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
        return invoke("remove_crosshair_from_autoexec");
      }
      if (activeCrosshair) {
        return invoke("apply_crosshair_to_autoexec", {
          config: activeCrosshair,
        });
      }
      return Promise.resolve();
    },
    onSuccess: (_, enabled) => {
      if (!enabled) {
        toast.success(t("crosshairs.removedRestart"));
      } else if (activeCrosshair) {
        toast.success(t("crosshairs.appliedRestart"));
      }
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("crosshairs.toggleError"));
    },
  });

  const handleToggle = (checked: boolean) => {
    setCrosshairsEnabled(checked);
    toggleMutation.mutate(checked);
  };

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.customCrosshairs")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.customCrosshairsDescription")}
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
