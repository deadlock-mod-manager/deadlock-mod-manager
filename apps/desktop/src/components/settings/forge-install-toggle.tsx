import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const ForgeInstallToggle = () => {
  const { t } = useTranslation();
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );
  const setForgeInstallEnabled = usePersistedStore(
    (state) => state.setForgeInstallEnabled,
  );

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.forgeInstall")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.forgeInstallDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={forgeInstallEnabled}
          id='toggle-setting-forge-install'
          onCheckedChange={setForgeInstallEnabled}
        />
        <Label htmlFor='toggle-setting-forge-install'>
          {forgeInstallEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
