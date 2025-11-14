import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const AutoUpdateToggle = () => {
  const { t } = useTranslation();
  const autoUpdateEnabled = usePersistedStore(
    (state) => state.autoUpdateEnabled,
  );
  const setAutoUpdateEnabled = usePersistedStore(
    (state) => state.setAutoUpdateEnabled,
  );

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>{t("settings.autoUpdate")}</Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.autoUpdateDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={autoUpdateEnabled}
          onCheckedChange={setAutoUpdateEnabled}
          id={`toggle-setting-auto-update`}
        />
        <Label htmlFor={`toggle-setting-auto-update`}>
          {autoUpdateEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
