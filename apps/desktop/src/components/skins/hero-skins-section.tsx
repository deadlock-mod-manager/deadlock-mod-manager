import { Button } from "@deadlock-mods/ui/components/button";
import { Shuffle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { DefaultSkinCard } from "@/components/skins/default-skin-card";
import { HeroSectionHeader } from "@/components/skins/hero-section-header";
import { ShufflePoolBar } from "@/components/skins/shuffle-pool-bar";
import { SkinCard } from "@/components/skins/skin-card";
import type { HeroModGroup } from "@/lib/mods/hero-mods";
import {
  canRandomizeMod,
  RANDOMIZER_MIN_POOL,
} from "@/lib/mods/skin-randomizer";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface HeroSkinsSectionProps {
  hero: string;
  group: HeroModGroup<LocalMod>;
  disabled: boolean;
  /** The randomizer owns this hero, so which skin is on stays a surprise. */
  randomized: boolean;
  poolMode: boolean;
  /** Skins and the default look the next launch can land on. */
  poolSize: number;
  onPoolModeChange: (poolMode: boolean) => void;
  /** A skin to wear, or null for the default look. */
  onWear: (mod: LocalMod | null) => void;
  onRemove: (mod: LocalMod) => void;
  onDelete: (mod: LocalMod) => void;
}

export const HeroSkinsSection = ({
  hero,
  group,
  disabled,
  randomized,
  poolMode,
  poolSize,
  onPoolModeChange,
  onWear,
  onRemove,
  onDelete,
}: HeroSkinsSectionProps) => {
  const { t } = useTranslation();
  const randomizerEnabled = usePersistedStore(
    (state) => state.skinRandomizerEnabled,
  );
  const multipleSkinsEnabled = usePersistedStore(
    (state) => state.multipleSkinsEnabled,
  );
  const randomizerSkins = usePersistedStore((state) => state.randomizerSkins);
  const randomizerDefaultHeroes = usePersistedStore(
    (state) => state.randomizerDefaultHeroes,
  );
  const setRandomizerSkins = usePersistedStore(
    (state) => state.setRandomizerSkins,
  );
  const setRandomizerDefaultHeroes = usePersistedStore(
    (state) => state.setRandomizerDefaultHeroes,
  );
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);

  const { skins, activeSkins } = group;
  const defaultInPool = randomizerDefaultHeroes[hero] === true;
  const mode = poolMode ? "pool" : "wear";

  const startPicking = () => {
    onPoolModeChange(true);
    markFeatureUsed("skin-randomizer");
  };

  // The banner already says the hero is randomized, so the header only offers
  // the way into the pool.
  const headerAction = (
    <HintAnchor
      eligible={!randomizerEnabled && skins.length >= RANDOMIZER_MIN_POOL}
      hintId='skin-randomizer'
      side='left'>
      <Button
        className='h-7 shrink-0 px-2.5'
        icon={<Shuffle />}
        onClick={startPicking}
        size='sm'
        variant='outline'>
        {t(
          randomized
            ? "skins.randomizer.editPool"
            : "skins.randomizer.randomize",
        )}
      </Button>
    </HintAnchor>
  );

  return (
    <section className='flex flex-col gap-3'>
      {poolMode ? (
        <ShufflePoolBar
          allSkinIds={skins.map((skin) => skin.remoteId)}
          hero={hero}
          onDone={() => onPoolModeChange(false)}
          poolSize={poolSize}
          selectableSkinIds={skins
            .filter(canRandomizeMod)
            .map((skin) => skin.remoteId)}
          total={skins.length + 1}
        />
      ) : (
        <HeroSectionHeader
          action={headerAction}
          count={skins.length}
          hint={t(
            multipleSkinsEnabled
              ? "skins.skinsHintMultiple"
              : "skins.skinsHint",
          )}
          title={t("skins.skinsSection")}
        />
      )}
      <div className='grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3'>
        <DefaultSkinCard
          canPool
          disabled={disabled}
          hero={hero}
          inPool={defaultInPool}
          isEquipped={!randomized && activeSkins.length === 0}
          mode={mode}
          onTogglePool={() =>
            setRandomizerDefaultHeroes([hero], !defaultInPool)
          }
          onWear={() => onWear(null)}
        />
        {skins.map((mod) => {
          const canPool = canRandomizeMod(mod);
          const inPool = canPool && randomizerSkins[mod.remoteId] === true;
          return (
            <SkinCard
              canPool={canPool}
              disabled={disabled}
              hero={hero}
              inPool={inPool}
              isEquipped={
                !randomized &&
                activeSkins.some((active) => active.remoteId === mod.remoteId)
              }
              key={mod.remoteId}
              mod={mod}
              mode={mode}
              onDelete={() => onDelete(mod)}
              onRemove={() => onRemove(mod)}
              onTogglePool={() => setRandomizerSkins([mod.remoteId], !inPool)}
              onWear={() => onWear(mod)}
            />
          );
        })}
      </div>
    </section>
  );
};
