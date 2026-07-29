import { Button } from "@deadlock-mods/ui/components/button";
import { Settings } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { ModOptionsDialog } from "@/components/mod-management/mod-options-dialog";
import { useModOptions } from "@/hooks/use-mod-options";
import type { LocalMod } from "@/types/mods";

interface SkinVariantControlsProps {
  mod: LocalMod;
}

export const SkinVariantControls = ({ mod }: SkinVariantControlsProps) => {
  const { t } = useTranslation();
  const modOptions = useModOptions(mod);

  if (!modOptions.showButton) {
    return null;
  }

  return (
    // Stop propagation so the controls never bubble a click into the card's
    // select handler.
    <div
      className='flex items-center justify-between gap-2 border-t px-3 py-2'
      onClick={(e) => e.stopPropagation()}>
      <span className='truncate text-muted-foreground text-xs'>
        {[...modOptions.activeArchiveNames].join(", ")}
      </span>
      <Button
        icon={<Settings className='h-3 w-3' />}
        onClick={modOptions.open}
        size='sm'
        variant='outline'>
        {t("skins.variants")}
      </Button>
      <ModOptionsDialog
        activeArchiveNames={modOptions.activeArchiveNames}
        downloads={modOptions.downloads}
        isOpen={modOptions.isOpen}
        isSaving={modOptions.isSaving}
        modName={mod.name}
        onApply={modOptions.apply}
        onCancel={modOptions.close}
        onDiskArchiveNames={modOptions.onDiskArchiveNames}
        onOpenChange={(open) => (open ? modOptions.open() : modOptions.close())}
      />
    </div>
  );
};
