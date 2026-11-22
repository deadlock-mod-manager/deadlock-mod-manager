import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { applySegmentedDownloadsSetting } from "@/lib/download/segmented-downloads";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const SegmentedDownloadsToggle = () => {
  const { t } = useTranslation();
  const segmentedDownloads = usePersistedStore(
    (state) => state.segmentedDownloads,
  );
  const setSegmentedDownloads = usePersistedStore(
    (state) => state.setSegmentedDownloads,
  );

  // Saved only once the backend has it, so the switch never shows a mode the
  // downloader isn't using.
  const toggleMutation = useMutation({
    mutationFn: applySegmentedDownloadsSetting,
    onSuccess: (_, enabled) => {
      setSegmentedDownloads(enabled);
    },
    onError: (error) => {
      logger
        .withError(error)
        .error("Failed to sync the segmented downloads setting");
      toast.error(t("settings.segmentedDownloadsSyncFailed"));
    },
  });

  return (
    <SettingToggleRow
      checked={segmentedDownloads}
      description={t("settings.segmentedDownloadsDescription")}
      disabled={toggleMutation.isPending}
      id='toggle-setting-segmented-downloads'
      onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
      title={t("settings.segmentedDownloads")}
    />
  );
};
