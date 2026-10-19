import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const FeatureTipsToggle = () => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.featureHints.enabled);
  const setEnabled = usePersistedStore((state) => state.setFeatureHintsEnabled);

  return (
    <SettingToggleRow
      checked={enabled}
      description={t("settings.featureTipsDescription")}
      id='toggle-setting-feature-tips'
      onCheckedChange={setEnabled}
      title={t("settings.featureTips")}
    />
  );
};
