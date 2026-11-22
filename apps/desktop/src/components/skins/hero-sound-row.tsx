import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { HeroModActionsMenu } from "@/components/skins/hero-mod-actions-menu";
import { SkinVariantControls } from "@/components/skins/skin-variant-controls";
import { SoundPreviewButton } from "@/components/skins/sound-preview-button";
import { getModCategoryLabelKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

interface HeroSoundRowProps {
  mod: LocalMod;
  hero: string;
  isActive: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onDelete: () => void;
}

/**
 * A hero sound or extra. These stack on top of a skin instead of replacing it,
 * so each one gets its own switch rather than a pick-one card.
 */
export const HeroSoundRow = ({
  mod,
  hero,
  isActive,
  disabled,
  onToggle,
  onRemove,
  onDelete,
}: HeroSoundRowProps) => {
  const { t } = useTranslation();
  const categoryKey = getModCategoryLabelKey(mod.category);
  // The category is what tells a killsound apart from a voice pack, which the
  // name and author often do not.
  const categoryLabel = categoryKey
    ? t(`modCategories.${categoryKey}`)
    : mod.category;

  return (
    <div className='flex h-14 items-center gap-3 border-t pr-2 pl-3 first:border-t-0'>
      <SoundPreviewButton audioUrl={mod.audioUrl} modId={mod.remoteId} />
      <div className='min-w-0 flex-1'>
        <div
          className={cn(
            "truncate font-medium text-sm",
            !isActive && "text-foreground/80",
          )}>
          {mod.name}
        </div>
        <div className='truncate text-muted-foreground text-xs'>
          {mod.author}
        </div>
      </div>
      <span className='shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-muted-foreground text-xs'>
        {categoryLabel}
      </span>
      <SkinVariantControls mod={mod} />
      <Switch
        aria-label={t("skins.toggleMod", { mod: mod.name })}
        checked={isActive}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
      <HeroModActionsMenu
        disabled={disabled}
        hero={hero}
        onDelete={onDelete}
        onRemove={onRemove}
        variant='ghost'
      />
    </div>
  );
};
