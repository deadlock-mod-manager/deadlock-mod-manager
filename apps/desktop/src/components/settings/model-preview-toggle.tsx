import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const ModelPreviewToggle = () => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.foundry3dPreviewEnabled);
  const setEnabled = usePersistedStore(
    (state) => state.setFoundry3dPreviewEnabled,
  );

  return (
    <SettingToggleRow
      checked={enabled}
      description={t("settings.modelPreviewDescription")}
      id='toggle-setting-model-preview'
      onCheckedChange={setEnabled}
      title={t("settings.modelPreview")}
    />
  );
};
