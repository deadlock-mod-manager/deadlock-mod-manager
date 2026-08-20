import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
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
  const activeCount = modOptions.activeVariantCount;

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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("skins.variants")}
            className='h-8 shrink-0 gap-1 px-2'
            icon={<Settings className='h-3 w-3' />}
            onClick={modOptions.open}
            size='sm'
            variant='outline'>
            {activeCount > 0 && (
              <span className='font-medium text-xs tabular-nums leading-none'>
                {activeCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {activeCount > 0
            ? t("skins.variantsWithCount", { count: activeCount })
            : t("skins.variants")}
        </TooltipContent>
      </Tooltip>
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
