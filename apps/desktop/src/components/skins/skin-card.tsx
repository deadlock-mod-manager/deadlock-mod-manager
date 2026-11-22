import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Lock } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { NSFWBlur } from "@/components/mod-browsing/nsfw-blur";
import { HeroModActionsMenu } from "@/components/skins/hero-mod-actions-menu";
import {
  SkinCardShell,
  type SkinCardState,
} from "@/components/skins/skin-card-shell";
import { SkinVariantControls } from "@/components/skins/skin-variant-controls";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { getModCoverImage } from "@/lib/mods/mod-images";
import type { LocalMod } from "@/types/mods";

interface SkinCardProps extends SkinCardState {
  mod: LocalMod;
  hero: string;
  onWear: () => void;
  onTogglePool: () => void;
  onRemove: () => void;
  onDelete: () => void;
}

export const SkinCard = ({
  mod,
  hero,
  onRemove,
  onDelete,
  ...state
}: SkinCardProps) => {
  const { t } = useTranslation();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);
  const coverImage = getModCoverImage(mod);
  // Only pool mode needs to say why a skin cannot be ticked.
  const showLocked = state.mode === "pool" && !state.canPool;

  return (
    <SkinCardShell
      {...state}
      hoverActions={
        <HeroModActionsMenu
          disabled={state.disabled}
          hero={hero}
          onDelete={onDelete}
          onRemove={onRemove}
          variant='secondary'
        />
      }
      media={
        coverImage ? (
          <NSFWBlur
            blurStrength={nsfwSettings.blurStrength}
            className='h-full w-full overflow-hidden'
            disableBlur={nsfwSettings.disableBlur}
            isNSFW={shouldBlur}
            onToggleVisibility={handleNSFWToggle}>
            <img
              alt={mod.name}
              className='h-32 w-full object-cover'
              decoding='async'
              loading='lazy'
              src={coverImage}
            />
          </NSFWBlur>
        ) : (
          <div className='flex h-full w-full items-center justify-center text-muted-foreground text-sm'>
            {t("mods.noPreviewAvailable")}
          </div>
        )
      }>
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium text-sm'>{mod.name}</div>
        {showLocked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='flex items-center gap-1 truncate text-secondary-foreground text-xs'>
                <Lock className='h-3 w-3 shrink-0' />
                <span className='truncate'>
                  {t("skins.randomizer.cannotRandomize")}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className='max-w-64'>
              {t("skins.randomizer.unavailable")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className='truncate text-muted-foreground text-xs'>
            {mod.author}
          </div>
        )}
      </div>
      <SkinVariantControls mod={mod} />
    </SkinCardShell>
  );
};
