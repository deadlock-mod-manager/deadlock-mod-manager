import { Button } from "@deadlock-mods/ui/components/button";
import {
  Layers,
  PackagePlus,
  Music,
  Plus,
  Shirt,
  Shuffle,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import { WornSkinThumb } from "@/components/skins/worn-skin-thumb";
import { useHeroArt } from "@/hooks/use-hero-art";
import type { HeroModGroup } from "@/lib/mods/hero-mods";
import type { LocalMod } from "@/types/mods";

interface HeroBannerProps {
  hero: string;
  group: HeroModGroup<LocalMod>;
  /** Pool size while the randomizer rolls this hero's skin, otherwise null. */
  randomizedPoolSize: number | null;
  disabled: boolean;
  onAssignMod: () => void;
  onBrowseSkins: () => void;
}

export const HeroBanner = ({
  hero,
  group,
  randomizedPoolSize,
  disabled,
  onAssignMod,
  onBrowseSkins,
}: HeroBannerProps) => {
  const { t } = useTranslation();
  const { portrait, backdrop } = useHeroArt(hero);
  const { skins, sounds, extras, activeSkins, activeSounds, activeExtras } =
    group;
  const worn = activeSkins[0];

  return (
    <div className='relative flex h-[184px] shrink-0 overflow-hidden rounded-xl border bg-gradient-to-r from-card via-card to-background'>
      {backdrop && (
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-[length:72%_auto] bg-[position:right_-2%_top_30%] bg-no-repeat opacity-80 [mask-image:linear-gradient(to_left,#000_25%,transparent_85%)]'
          style={{ backgroundImage: `url(${backdrop})` }}
        />
      )}
      <div className='relative w-[160px] shrink-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_75%,transparent)]'>
        {portrait ? (
          <img
            alt=''
            className='-translate-x-1/2 absolute top-2 left-1/2 w-[184px] max-w-none'
            decoding='async'
            src={portrait}
          />
        ) : (
          <HeroIcon
            className='absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-lg'
            hero={hero}
          />
        )}
      </div>
      <div className='relative flex min-w-0 flex-1 flex-col justify-center gap-2 py-4 pr-4 pl-1.5'>
        <h2 className='truncate font-bold font-primary text-[40px] leading-[0.95]'>
          {hero}
        </h2>
        {randomizedPoolSize !== null ? (
          <p className='flex min-w-0 items-center gap-2 font-medium text-secondary-foreground text-sm'>
            <Shuffle className='h-3.5 w-3.5 shrink-0' />
            <span className='truncate'>
              {t("skins.randomizer.heroActive", { count: randomizedPoolSize })}
            </span>
          </p>
        ) : (
          <p className='flex min-w-0 items-center gap-2 text-muted-foreground text-sm'>
            {t("skins.wearing")}
            {worn && <WornSkinThumb mod={worn} />}
            <span className='truncate font-medium text-foreground'>
              {activeSkins.length > 0
                ? activeSkins.map((mod) => mod.name).join(", ")
                : t("skins.default")}
            </span>
          </p>
        )}
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs'>
          <span className='flex items-center gap-1.5'>
            <Shirt className='h-3.5 w-3.5' />
            {skins.length > 0
              ? t("skins.skinCount", { count: skins.length })
              : t("skins.noSkinsYet")}
          </span>
          {sounds.length > 0 && (
            <span className='flex items-center gap-1.5'>
              <Music className='h-3.5 w-3.5' />
              {t("skins.soundsOn", {
                active: activeSounds.length,
                count: sounds.length,
              })}
            </span>
          )}
          {extras.length > 0 && (
            <span className='flex items-center gap-1.5'>
              <Layers className='h-3.5 w-3.5' />
              {t("skins.extrasOn", {
                active: activeExtras.length,
                count: extras.length,
              })}
            </span>
          )}
        </div>
      </div>
      <div className='relative flex shrink-0 items-start gap-2 pt-5 pr-5'>
        <Button
          disabled={disabled}
          icon={<PackagePlus />}
          onClick={onAssignMod}
          size='sm'
          variant='outline'>
          {t("skins.assignMod")}
        </Button>
        <Button
          disabled={disabled}
          icon={<Plus />}
          onClick={onBrowseSkins}
          size='sm'>
          {t("skins.browseSkins")}
        </Button>
      </div>
    </div>
  );
};
