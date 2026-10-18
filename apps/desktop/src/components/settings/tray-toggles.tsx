import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { applyTrayBehavior, type TrayBehavior } from "@/lib/tray";
import { isTauriError } from "@/types/tauri";

export const TrayToggles = () => {
  const { t } = useTranslation();
  const minimizeToTray = usePersistedStore((state) => state.minimizeToTray);
  const closeToTray = usePersistedStore((state) => state.closeToTray);
  const setTrayBehavior = usePersistedStore((state) => state.setTrayBehavior);

  const toggleMutation = useMutation({
    mutationFn: applyTrayBehavior,
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (_, behavior) => {
      setTrayBehavior(behavior);
    },
    onError: (error) => {
      logger.withError(error).error("Failed to sync the tray settings");
      toast.error(
        isTauriError(error) && error.kind === "trayUnavailable"
          ? t("settings.trayUnavailable")
          : t("settings.traySyncFailed"),
      );
    },
  });

  const update = (change: Partial<TrayBehavior>) =>
    toggleMutation.mutate({ minimizeToTray, closeToTray, ...change });

  return (
    <>
      <SettingToggleRow
        checked={minimizeToTray}
        description={t("settings.minimizeToTrayDescription")}
        disabled={toggleMutation.isPending}
        id='toggle-setting-minimize-to-tray'
        onCheckedChange={(enabled) => update({ minimizeToTray: enabled })}
        title={t("settings.minimizeToTray")}
      />
      <SettingToggleRow
        checked={closeToTray}
        description={t("settings.closeToTrayDescription")}
        disabled={toggleMutation.isPending}
        id='toggle-setting-close-to-tray'
        onCheckedChange={(enabled) => update({ closeToTray: enabled })}
        title={t("settings.closeToTray")}
      />
    </>
  );
};
