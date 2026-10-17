import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const AutoResetGameinfoToggle = () => {
  const { t } = useTranslation();
  const autoResetEnabled = usePersistedStore(
    (state) => state.autoResetGameinfoOnExit,
  );
  const setAutoResetEnabled = usePersistedStore(
    (state) => state.setAutoResetGameinfoOnExit,
  );

  return (
    <SettingToggleRow
      checked={autoResetEnabled}
      description={t("settings.autoResetGameinfoDescription")}
      id='toggle-setting-auto-reset-gameinfo'
      onCheckedChange={setAutoResetEnabled}
      title={t("settings.autoResetGameinfo")}
    />
  );
};
