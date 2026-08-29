import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

/** One switch for both 3D previews: the Hero Skins panel and the Mod Foundry. */
export const ModelPreviewToggle = () => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.foundry3dPreviewEnabled);
  const setEnabled = usePersistedStore(
    (state) => state.setFoundry3dPreviewEnabled,
  );

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("settings.modelPreview")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("settings.modelPreviewDescription")}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={enabled}
            id='toggle-setting-model-preview'
            onCheckedChange={setEnabled}
          />
          <Label htmlFor='toggle-setting-model-preview'>
            {enabled ? t("status.enabled") : t("status.disabled")}
          </Label>
        </div>
      </div>

      {enabled && (
        <div className='flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5'>
          <WarningIcon className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
          <p className='text-xs leading-relaxed'>
            {t("settings.modelPreviewWarning")}
          </p>
        </div>
      )}
    </div>
  );
};
