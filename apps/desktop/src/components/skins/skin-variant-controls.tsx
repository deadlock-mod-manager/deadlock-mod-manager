import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { SlidersHorizontal } from "@deadlock-mods/ui/icons";
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

  const activeNames = [...modOptions.activeArchiveNames].join(", ");

  return (
    // The dialog renders in a portal but still bubbles React events through
    // here, so stop them before they reach the card's select handler.
    <div
      className='shrink-0'
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("skins.variants")}
            className='h-7 shrink-0 gap-1 px-2 [&_svg]:size-3.5'
            icon={<SlidersHorizontal />}
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
          {activeNames && (
            <span className='block opacity-80'>{activeNames}</span>
          )}
        </TooltipContent>
      </Tooltip>
      <ModOptionsDialog
        activeArchiveNames={modOptions.activeArchiveNames}
        downloads={modOptions.downloads}
        isOpen={modOptions.isOpen}
        isSaving={modOptions.isSaving}
        onCancelApply={modOptions.cancelApply}
        progress={modOptions.progress}
        modName={mod.name}
        onApply={modOptions.apply}
        fileTree={modOptions.fileTree}
        onApplyFiles={modOptions.applyFileSelection}
        isSavingFiles={modOptions.isSavingFiles}
        onDiskArchiveNames={modOptions.onDiskArchiveNames}
        onOpenChange={(open) => (open ? modOptions.open() : modOptions.close())}
      />
    </div>
  );
};
