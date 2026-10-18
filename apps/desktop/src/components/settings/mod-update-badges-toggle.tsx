import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const ModUpdateBadgesToggle = () => {
  const { t } = useTranslation();
  const showModUpdateBadges = usePersistedStore(
    (state) => state.showModUpdateBadges,
  );
  const setShowModUpdateBadges = usePersistedStore(
    (state) => state.setShowModUpdateBadges,
  );

  return (
    <SettingToggleRow
      checked={showModUpdateBadges}
      description={t("settings.showModUpdateBadgesDescription")}
      id='toggle-setting-mod-update-badges'
      onCheckedChange={setShowModUpdateBadges}
      title={t("settings.showModUpdateBadges")}
    />
  );
};
