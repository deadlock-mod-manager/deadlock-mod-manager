import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroBanner } from "@/components/skins/hero-banner";
import { HeroSkinsEmpty } from "@/components/skins/hero-skins-empty";
import { HeroSkinsSection } from "@/components/skins/hero-skins-section";
import { HeroSoundsSection } from "@/components/skins/hero-sounds-section";
import { SkinConflictNotice } from "@/components/skins/skin-conflict-notice";
import type { HeroModGroup, HeroModKind } from "@/lib/mods/hero-mods";
import { isRandomizedPool, randomizerPool } from "@/lib/mods/skin-randomizer";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface HeroModGridProps {
  hero: string;
  group: HeroModGroup<LocalMod>;
  disabled: boolean;
  onSelect: (mod: LocalMod | null, kind: HeroModKind) => void;
  onBrowseSkins: () => void;
  onAssignMod: () => void;
  onRemove: (mod: LocalMod) => void;
  onDelete: (mod: LocalMod) => void;
}

export const HeroModGrid = ({
  hero,
  group,
  disabled,
  onSelect,
  onBrowseSkins,
  onAssignMod,
  onRemove,
  onDelete,
}: HeroModGridProps) => {
  const { t } = useTranslation();
  const [poolMode, setPoolMode] = useState(false);
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

  const { skins, sounds, extras, activeSkins } = group;
  const pool = randomizerPool(hero, group, {
    skins: randomizerSkins,
    defaultHeroes: randomizerDefaultHeroes,
  });
  const randomized = randomizerEnabled && isRandomizedPool(pool);
  const conflicted =
    !randomized && !multipleSkinsEnabled && activeSkins.length > 1;
  const activeIds = new Set(
    [...group.activeSounds, ...group.activeExtras].map((mod) => mod.remoteId),
  );

  return (
    <div className='-ml-1 flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-2 pb-1 pl-1 *:shrink-0'>
      <HeroBanner
        disabled={disabled}
        group={group}
        hero={hero}
        onAssignMod={onAssignMod}
        onBrowseSkins={onBrowseSkins}
        randomizedPoolSize={randomized ? pool.length : null}
      />
      {conflicted && (
        <SkinConflictNotice count={activeSkins.length} hero={hero} />
      )}
      {skins.length > 0 ? (
        <HeroSkinsSection
          disabled={disabled}
          group={group}
          hero={hero}
          onDelete={onDelete}
          onPoolModeChange={setPoolMode}
          onRemove={onRemove}
          onWear={(mod) => onSelect(mod, "skin")}
          poolMode={poolMode}
          poolSize={pool.length}
          randomized={randomized}
        />
      ) : (
        <HeroSkinsEmpty
          disabled={disabled}
          hero={hero}
          onAssignMod={onAssignMod}
          onBrowseSkins={onBrowseSkins}
          onWearDefault={() => onSelect(null, "skin")}
        />
      )}
      {sounds.length > 0 && (
        <HeroSoundsSection
          activeIds={activeIds}
          disabled={disabled}
          hero={hero}
          hint={t("skins.soundsHint")}
          mods={sounds}
          onDelete={onDelete}
          onRemove={onRemove}
          onToggle={(mod) => onSelect(mod, "sound")}
          title={t("skins.sounds")}
        />
      )}
      {extras.length > 0 && (
        <HeroSoundsSection
          activeIds={activeIds}
          disabled={disabled}
          hero={hero}
          hint={t("skins.extrasHint")}
          mods={extras}
          onDelete={onDelete}
          onRemove={onRemove}
          onToggle={(mod) => onSelect(mod, "extra")}
          title={t("skins.extras")}
        />
      )}
    </div>
  );
};
