import { Card } from "@deadlock-mods/ui/components/card";
import { Check } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { NSFWBlur } from "@/components/mod-browsing/nsfw-blur";
import { SkinVariantControls } from "@/components/skins/skin-variant-controls";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

interface SkinCardProps {
  mod: LocalMod;
  isActive: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export const SkinCard = ({
  mod,
  isActive,
  disabled,
  onSelect,
}: SkinCardProps) => {
  const { t } = useTranslation();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden shadow-none transition-colors hover:border-primary",
        isActive && "ring-2 ring-primary",
        disabled && "pointer-events-none opacity-60",
      )}
      onClick={() => {
        if (!disabled) {
          onSelect();
        }
      }}>
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
            {mod.author}
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
  onSelect: () => void;
}

export const DefaultSkinCard = ({
  isActive,
  disabled,
  onSelect,
}: DefaultSkinCardProps) => {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden shadow-none transition-colors hover:border-primary",
        isActive && "ring-2 ring-primary",
        disabled && "pointer-events-none opacity-60",
      )}
      onClick={() => {
        if (!disabled) {
          onSelect();
        }
      }}>
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
