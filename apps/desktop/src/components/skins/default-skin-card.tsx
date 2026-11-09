import { useTranslation } from "react-i18next";
import {
  SkinCardShell,
  type SkinCardState,
} from "@/components/skins/skin-card-shell";
import { useHeroArt } from "@/hooks/use-hero-art";

interface DefaultSkinCardProps extends SkinCardState {
  hero: string;
  onWear: () => void;
  onTogglePool?: () => void;
}

export const DefaultSkinCard = ({ hero, ...state }: DefaultSkinCardProps) => {
  const { t } = useTranslation();
  const { portrait, backdrop } = useHeroArt(hero);

  return (
    <SkinCardShell
      {...state}
      media={
        <div className='relative h-full w-full bg-card'>
          {backdrop && (
            <img
              alt=''
              className='absolute inset-0 h-full w-full object-cover object-[85%_30%] opacity-50'
              decoding='async'
              loading='lazy'
              src={backdrop}
            />
          )}
          {portrait ? (
            <img
              alt=''
              className='-translate-x-1/2 absolute top-1 left-1/2 w-[118px]'
              decoding='async'
              loading='lazy'
              src={portrait}
            />
          ) : (
            <div className='relative flex h-full items-center justify-center text-muted-foreground'>
              {t("skins.default")}
            </div>
          )}
        </div>
      }>
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium text-sm'>{t("skins.default")}</div>
        <div className='truncate text-muted-foreground text-xs'>
          {t("skins.defaultDescription")}
        </div>
      </div>
    </SkinCardShell>
  );
};
