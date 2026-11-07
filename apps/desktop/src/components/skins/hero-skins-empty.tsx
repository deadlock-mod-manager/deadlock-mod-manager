import { Button } from "@deadlock-mods/ui/components/button";
import { PackagePlus, Plus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { DefaultSkinCard } from "@/components/skins/default-skin-card";
import { HeroSectionHeader } from "@/components/skins/hero-section-header";
import { PopularHeroSkins } from "@/components/skins/popular-hero-skins";

interface HeroSkinsEmptyProps {
  hero: string;
  disabled: boolean;
  onWearDefault: () => void;
  onBrowseSkins: () => void;
  onAssignMod: () => void;
}

/**
 * A hero without skins still wears something: the default look stays on the
 * page, next to the two ways of getting a skin and the store's popular picks.
 */
export const HeroSkinsEmpty = ({
  hero,
  disabled,
  onWearDefault,
  onBrowseSkins,
  onAssignMod,
}: HeroSkinsEmptyProps) => {
  const { t } = useTranslation();

  return (
    <>
      <section className='flex flex-col gap-3'>
        <HeroSectionHeader
          count={0}
          hint={t("skins.skinsHint")}
          title={t("skins.skinsSection")}
        />
        <div className='flex items-center gap-7 rounded-xl border border-dashed p-3'>
          <div className='w-[232px] shrink-0'>
            <DefaultSkinCard
              canPool={false}
              disabled={disabled}
              hero={hero}
              inPool={false}
              isEquipped
              mode='wear'
              onWear={onWearDefault}
            />
          </div>
          <div className='min-w-0'>
            <p className='font-semibold text-base'>
              {t("skins.emptyTitle", { hero })}
            </p>
            <p className='mt-1.5 max-w-[470px] text-muted-foreground text-sm leading-relaxed'>
              {t("skins.emptyHint", { hero })}
            </p>
            <div className='mt-3.5 flex flex-wrap gap-2'>
              <Button
                disabled={disabled}
                icon={<Plus />}
                onClick={onBrowseSkins}
                size='sm'>
                {t("skins.browseSkinsFor", { hero })}
              </Button>
              <Button
                disabled={disabled}
                icon={<PackagePlus />}
                onClick={onAssignMod}
                size='sm'
                variant='outline'>
                {t("skins.assignDownloaded")}
              </Button>
            </div>
          </div>
        </div>
      </section>
      <PopularHeroSkins hero={hero} onSeeAll={onBrowseSkins} />
    </>
  );
};
