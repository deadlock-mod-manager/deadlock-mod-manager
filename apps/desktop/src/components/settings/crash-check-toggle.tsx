import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const CrashCheckToggle = () => {
  const { t } = useTranslation();
  const crashCheckEnabled = usePersistedStore(
    (state) => state.crashCheckEnabled,
  );
  const setCrashCheckEnabled = usePersistedStore(
    (state) => state.setCrashCheckEnabled,
  );

  return (
    <SettingToggleRow
      checked={crashCheckEnabled}
      description={t("launchHealth.settings.description")}
      id='toggle-setting-crash-check'
      onCheckedChange={setCrashCheckEnabled}
      title={t("launchHealth.settings.title")}
    />
  );
};
