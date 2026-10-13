import { WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
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
      <SettingToggleRow
        checked={enabled}
        description={t("settings.modelPreviewDescription")}
        id='toggle-setting-model-preview'
        onCheckedChange={setEnabled}
        title={t("settings.modelPreview")}
      />

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
