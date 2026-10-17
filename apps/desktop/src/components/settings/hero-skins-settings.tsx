import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const HeroSkinsSettings = () => {
  const { t } = useTranslation();
  const multipleSkinsEnabled = usePersistedStore(
    (state) => state.multipleSkinsEnabled,
  );
  const setMultipleSkinsEnabled = usePersistedStore(
    (state) => state.setMultipleSkinsEnabled,
  );
  const heroExtrasEnabled = usePersistedStore(
    (state) => state.heroExtrasEnabled,
  );
  const setHeroExtrasEnabled = usePersistedStore(
    (state) => state.setHeroExtrasEnabled,
  );

  return (
    <div className='flex flex-col gap-4'>
      <SettingToggleRow
        checked={multipleSkinsEnabled}
        description={t("settings.multipleSkinsDescription")}
        id='toggle-setting-multiple-skins'
        onCheckedChange={setMultipleSkinsEnabled}
        title={t("settings.multipleSkins")}
      />
      <SettingToggleRow
        checked={heroExtrasEnabled}
        description={t("settings.heroExtrasDescription")}
        id='toggle-setting-hero-extras'
        onCheckedChange={setHeroExtrasEnabled}
        title={t("settings.heroExtras")}
      />
    </div>
  );
};
