import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { SettingToggleRow } from "@/components/settings/setting-row";
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

  useEffect(() => {
    const updateWatcher = async () => {
      try {
        if (ingestToolEnabled) {
          await invoke("start_cache_watcher");
        } else {
          await invoke("stop_cache_watcher");
        }
      } catch (error) {
        console.error("Failed to update cache watcher:", error);
      }
    };

    updateWatcher();
  }, [ingestToolEnabled]);

  return (
    <SettingToggleRow
      checked={ingestToolEnabled}
      description={t("settings.ingestTool.description")}
      extra={SettingsIngestExtra ? <SettingsIngestExtra /> : null}
      id='toggle-setting-ingest-tool'
      onCheckedChange={setIngestToolEnabled}
      title={t("settings.ingestTool.title")}
    />
  );
};
