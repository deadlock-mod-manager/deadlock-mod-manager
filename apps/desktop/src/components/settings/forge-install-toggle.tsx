import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const ForgeInstallToggle = () => {
  const { t } = useTranslation();
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );
  const setForgeInstallEnabled = usePersistedStore(
    (state) => state.setForgeInstallEnabled,
  );

  return (
    <SettingToggleRow
      checked={forgeInstallEnabled}
      description={t("settings.forgeInstallDescription")}
      id='toggle-setting-forge-install'
      onCheckedChange={setForgeInstallEnabled}
      title={t("settings.forgeInstall")}
    />
  );
};
