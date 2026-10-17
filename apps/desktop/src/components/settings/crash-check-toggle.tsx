import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { usePersistedStore } from "@/lib/store";

/** Ships with performance configs, behind the same experimental flag. */
export const CrashCheckToggle = () => {
  const { t } = useTranslation();
  const available = useExperimentalFeature("performance-configs");
  const crashCheckEnabled = usePersistedStore(
    (state) => state.crashCheckEnabled,
  );
  const setCrashCheckEnabled = usePersistedStore(
    (state) => state.setCrashCheckEnabled,
  );

  if (!available) return null;
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
