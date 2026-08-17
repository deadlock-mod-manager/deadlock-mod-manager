import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

const HeroSkinsToggle = ({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>{label}</Label>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
        <Label htmlFor={id}>
          {checked ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};

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
      <HeroSkinsToggle
        checked={multipleSkinsEnabled}
        description={t("settings.multipleSkinsDescription")}
        id='toggle-setting-multiple-skins'
        label={t("settings.multipleSkins")}
        onCheckedChange={setMultipleSkinsEnabled}
      />
      <HeroSkinsToggle
        checked={heroExtrasEnabled}
        description={t("settings.heroExtrasDescription")}
        id='toggle-setting-hero-extras'
        label={t("settings.heroExtras")}
        onCheckedChange={setHeroExtrasEnabled}
      />
    </div>
  );
};
