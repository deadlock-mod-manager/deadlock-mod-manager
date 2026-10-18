import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const AutoFixModsToggle = () => {
  const { t } = useTranslation();
  const autoFixMods = usePersistedStore((state) => state.autoFixMods);
  const setAutoFixMods = usePersistedStore((state) => state.setAutoFixMods);

  return (
    <SettingToggleRow
      checked={autoFixMods}
      description={t("settings.autoFixModsDescription")}
      id='toggle-setting-auto-fix-mods'
      onCheckedChange={setAutoFixMods}
      title={t("settings.autoFixMods")}
    />
  );
};
