import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const IngestToolToggle = () => {
  const { t } = useTranslation();
  const ingestToolEnabled = usePersistedStore(
    (state) => state.ingestToolEnabled,
  );
  const setIngestToolEnabled = usePersistedStore(
    (state) => state.setIngestToolEnabled,
  );

  // Start or stop the cache watcher when the setting changes
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
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <p>{t("settings.ingestTool.title")}</p>
        <p className='text-sm text-muted-foreground'>
          {t("settings.ingestTool.description")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={ingestToolEnabled}
          onCheckedChange={setIngestToolEnabled}
          id={`toggle-setting-ingest-tool`}
        />
        <Label htmlFor={`toggle-setting-ingest-tool`}>
          {ingestToolEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
