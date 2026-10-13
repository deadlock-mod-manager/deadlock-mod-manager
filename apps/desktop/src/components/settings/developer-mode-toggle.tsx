import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const DeveloperModeToggle = () => {
  const { t } = useTranslation();
  const developerMode = usePersistedStore((state) => state.developerMode);
  const setDeveloperMode = usePersistedStore((state) => state.setDeveloperMode);

  return (
    <SettingToggleRow
      checked={developerMode}
      id='toggle-setting-developer-mode'
      onCheckedChange={setDeveloperMode}
      title={t("settings.developerMode")}
    />
  );
};
