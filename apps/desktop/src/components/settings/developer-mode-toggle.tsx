import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const DeveloperModeToggle = () => {
  const { t } = useTranslation();
  const developerMode = usePersistedStore((state) => state.developerMode);
  const setDeveloperMode = usePersistedStore((state) => state.setDeveloperMode);

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <p>{t("settings.developerMode")}</p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={developerMode}
          onCheckedChange={setDeveloperMode}
          id={`toggle-setting-developer-mode`}
        />
        <Label htmlFor={`toggle-setting-developer-mode`}>
          {developerMode ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
