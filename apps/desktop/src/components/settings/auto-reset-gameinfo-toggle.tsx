import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const AutoResetGameinfoToggle = () => {
  const { t } = useTranslation();
  const autoResetEnabled = usePersistedStore(
    (state) => state.autoResetGameinfoOnExit,
  );
  const setAutoResetEnabled = usePersistedStore(
    (state) => state.setAutoResetGameinfoOnExit,
  );

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.autoResetGameinfo")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.autoResetGameinfoDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={autoResetEnabled}
          id='toggle-setting-auto-reset-gameinfo'
          onCheckedChange={setAutoResetEnabled}
        />
        <Label htmlFor='toggle-setting-auto-reset-gameinfo'>
          {autoResetEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
