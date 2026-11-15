import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { SettingToggleRow } from "@/components/settings/setting-row";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const IngestToolToggle = () => {
  const { t } = useTranslation();
  const ingestToolEnabled = usePersistedStore(
    (state) => state.ingestToolEnabled,
  );
  const setIngestToolEnabled = usePersistedStore(
    (state) => state.setIngestToolEnabled,
  );
  const SettingsIngestExtra = useThemeOverride("settingsIngestExtra");

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      invoke<void>(enabled ? "start_cache_watcher" : "stop_cache_watcher"),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (_, enabled) => setIngestToolEnabled(enabled),
    onError: (error, enabled) => {
      logger
        .withMetadata({ enabled })
        .withError(error)
        .error("Failed to update cache watcher");
      toast.error(t("settings.ingestTool.syncFailed"));
    },
  });

  return (
    <SettingToggleRow
      checked={ingestToolEnabled}
      description={t("settings.ingestTool.description")}
      disabled={toggleMutation.isPending}
      extra={SettingsIngestExtra ? <SettingsIngestExtra /> : null}
      id='toggle-setting-ingest-tool'
      onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
      title={t("settings.ingestTool.title")}
    />
  );
};
