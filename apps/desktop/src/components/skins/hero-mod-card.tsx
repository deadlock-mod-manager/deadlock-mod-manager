import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Check, EyeOff, MoreVertical, Trash2 } from "@deadlock-mods/ui/icons";
import { CubeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { NSFWBlur } from "@/components/mod-browsing/nsfw-blur";
import { SkinVariantControls } from "@/components/skins/skin-variant-controls";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { getModCategoryLabelKey } from "@/lib/constants";
import type { HeroModKind } from "@/lib/mods/hero-mods";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

const PreviewButton = ({
  label,
  disabled,
  onPreview,
}: {
  label: string;
  disabled: boolean;
  onPreview: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        aria-label={label}
        className='h-7 w-7'
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        size='icon'
        variant='secondary'>
        <CubeIcon className='h-3.5 w-3.5' weight='duotone' />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

interface HeroModCardProps {
  mod: LocalMod;
  hero: string;
  kind: HeroModKind;
  isActive: boolean;
  disabled: boolean;
  /** True while this skin is the one the 3D panel is showing. */
  isPreviewing: boolean;
  onSelect: () => void;
  /** Show this skin in the 3D panel without making it the active one. */
  onPreview?: () => void;
  /** Takes it off this hero's list without touching the download. */
  onRemove: () => void;
  onDelete: () => void;
}

export const HeroModCard = ({
  mod,
  hero,
  kind,
  isActive,
  disabled,
  isPreviewing,
  onSelect,
  onPreview,
  onRemove,
  onDelete,
}: HeroModCardProps) => {
  const { t } = useTranslation();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);
  const categoryKey = getModCategoryLabelKey(mod.category);
  const categoryLabel = categoryKey
    ? t(`modCategories.${categoryKey}`)
    : mod.category;

  const handleSelect = () => {
    if (!disabled) {
      onSelect();
    }
  };

  return (
    <Card
      aria-disabled={disabled}
      aria-pressed={isActive}
      className={cn(
        "group/skin relative cursor-pointer overflow-hidden shadow-none transition-colors hover:border-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive && "ring-2 ring-primary",
        !isActive && isPreviewing && "ring-1 ring-primary/50",
        disabled && "pointer-events-none opacity-60",
      )}
      onClick={handleSelect}
      onKeyDown={(e) => {
        // Guard on the card itself so Enter on the nested NSFW or variant
        // controls does not also trigger a swap.
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          handleSelect();
        }
      }}
      role='button'
      tabIndex={disabled ? -1 : 0}>
      <div className='absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/skin:opacity-100 group-focus-within/skin:opacity-100'>
        {kind === "skin" && onPreview && (
          <PreviewButton
            disabled={disabled}
            label={t("skins.preview.previewSkin")}
            onPreview={onPreview}
          />
        )}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("skins.modActions")}
                  className='h-7 w-7 data-[state=open]:opacity-100'
                  disabled={disabled}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  size='icon'
                  variant='secondary'>
                  <MoreVertical className='h-3.5 w-3.5' />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("skins.modActions")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={onRemove}>
              <EyeOff className='h-4 w-4' />
              {t("skins.removeFromHero", { hero })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className='text-destructive focus:bg-destructive/10 focus:text-destructive'
              onSelect={onDelete}>
              <Trash2 className='h-4 w-4' />
              {t("skins.deleteMod")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {mod.images.length > 0 ? (
        <NSFWBlur
          blurStrength={nsfwSettings.blurStrength}
          className='h-32 w-full overflow-hidden'
          disableBlur={nsfwSettings.disableBlur}
          isNSFW={shouldBlur}
          onToggleVisibility={handleNSFWToggle}>
          <img
            alt={mod.name}
            className='h-32 w-full object-cover'
            decoding='async'
            loading='lazy'
            src={mod.images[0]}
          />
        </NSFWBlur>
      ) : (
        <div className='flex h-32 w-full items-center justify-center bg-muted text-muted-foreground text-sm'>
          {t("mods.noPreviewAvailable")}
        </div>
      )}
      <div className='flex items-start justify-between gap-2 p-3'>
        <div className='min-w-0'>
          <div className='truncate font-medium text-sm'>{mod.name}</div>
          <div className='truncate text-muted-foreground text-xs'>
            {/* An extra's category is what tells a killsound apart from a voice
                pack, which its author and name often do not. */}
            {kind === "extra" ? categoryLabel : mod.author}
          </div>
        </div>
        {isActive && <Check className='h-4 w-4 shrink-0 text-primary' />}
      </div>
      <SkinVariantControls mod={mod} />
    </Card>
  );
};

interface DefaultSkinCardProps {
  isActive: boolean;
  disabled: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

export const DefaultSkinCard = ({
  isActive,
  disabled,
  isPreviewing,
  onSelect,
  onPreview,
}: DefaultSkinCardProps) => {
  const { t } = useTranslation();

  const handleSelect = () => {
    if (!disabled) {
      onSelect();
    }
  };

  return (
    <Card
      aria-disabled={disabled}
      aria-pressed={isActive}
      className={cn(
        "group/skin relative cursor-pointer overflow-hidden shadow-none transition-colors hover:border-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive && "ring-2 ring-primary",
        !isActive && isPreviewing && "ring-1 ring-primary/50",
        disabled && "pointer-events-none opacity-60",
      )}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      role='button'
      tabIndex={disabled ? -1 : 0}>
      <div className='absolute top-2 right-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover/skin:opacity-100 group-focus-within/skin:opacity-100'>
        <PreviewButton
          disabled={disabled}
          label={t("skins.preview.previewDefault")}
          onPreview={onPreview}
        />
      </div>
      <div className='flex h-32 w-full items-center justify-center bg-muted text-muted-foreground'>
        {t("skins.default")}
      </div>
      <div className='flex items-start justify-between gap-2 p-3'>
        <div className='min-w-0'>
          <div className='truncate font-medium text-sm'>
            {t("skins.default")}
          </div>
          <div className='truncate text-muted-foreground text-xs'>
            {t("skins.defaultDescription")}
          </div>
        </div>
        {isActive && <Check className='h-4 w-4 shrink-0 text-primary' />}
      </div>
    </Card>
  );
};
