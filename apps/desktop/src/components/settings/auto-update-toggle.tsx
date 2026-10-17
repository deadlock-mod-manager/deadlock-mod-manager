import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const AutoUpdateToggle = () => {
  const { t } = useTranslation();
  const autoUpdateEnabled = usePersistedStore(
    (state) => state.autoUpdateEnabled,
  );
  const setAutoUpdateEnabled = usePersistedStore(
    (state) => state.setAutoUpdateEnabled,
  );

  return (
    <SettingToggleRow
      checked={autoUpdateEnabled}
      description={t("settings.autoUpdateDescription")}
      id='toggle-setting-auto-update'
      onCheckedChange={setAutoUpdateEnabled}
      title={t("settings.autoUpdate")}
    />
  );
};
