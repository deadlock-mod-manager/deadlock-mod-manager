import { Button } from "@deadlock-mods/ui/components/button";
import { Shuffle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { RANDOMIZER_MIN_POOL } from "@/lib/mods/skin-randomizer";
import { usePersistedStore } from "@/lib/store";

interface ShufflePoolBarProps {
  hero: string;
  /** Skins and the default look the next launch can land on. */
  poolSize: number;
  /** Every skin plus the default look. */
  total: number;
  /** Skins that can go in the pool without a dialog at launch. */
  selectableSkinIds: string[];
  allSkinIds: string[];
  onDone: () => void;
}

export const ShufflePoolBar = ({
  hero,
  poolSize,
  total,
  selectableSkinIds,
  allSkinIds,
  onDone,
}: ShufflePoolBarProps) => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.skinRandomizerEnabled);
  const setRandomizerSkins = usePersistedStore(
    (state) => state.setRandomizerSkins,
  );
  const setRandomizerDefaultHeroes = usePersistedStore(
    (state) => state.setRandomizerDefaultHeroes,
  );

  const hint =
    poolSize < RANDOMIZER_MIN_POOL
      ? t("skins.randomizer.poolNeedsMore", { hero })
      : enabled
        ? t("skins.randomizer.poolHint")
        : t("skins.randomizer.poolOff");

  const selectAll = () => {
    setRandomizerSkins(selectableSkinIds, true);
    setRandomizerDefaultHeroes([hero], true);
  };

  const clear = () => {
    setRandomizerSkins(allSkinIds, false);
    setRandomizerDefaultHeroes([hero], false);
  };

  return (
    <div className='flex min-h-14 items-center justify-between gap-4 rounded-lg border border-secondary-foreground/35 bg-gradient-to-r from-secondary-foreground/[0.12] to-secondary-foreground/[0.04] py-2 pr-2 pl-3.5'>
      <div className='flex min-w-0 items-start gap-2.5'>
        <Shuffle className='mt-0.5 h-4 w-4 shrink-0 text-secondary-foreground' />
        <div className='min-w-0'>
          <div className='flex items-center gap-2 font-semibold text-sm'>
            {t("skins.randomizer.poolTitle")}
            <span className='rounded-full bg-secondary-foreground/15 px-1.5 py-0.5 font-medium font-mono text-[11px] text-secondary-foreground tabular-nums leading-none'>
              {t("skins.randomizer.poolCount", { count: poolSize, total })}
            </span>
          </div>
          <p className='mt-0.5 text-secondary-foreground/80 text-xs'>{hint}</p>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          className='h-7 px-2'
          disabled={poolSize === selectableSkinIds.length + 1}
          onClick={selectAll}
          size='sm'
          variant='ghost'>
          {t("skins.randomizer.selectAll")}
        </Button>
        <Button
          className='h-7 px-2'
          disabled={poolSize === 0}
          onClick={clear}
          size='sm'
          variant='ghost'>
          {t("skins.randomizer.clear")}
        </Button>
        <Button className='h-7 px-3' onClick={onDone} size='sm'>
          {t("skins.randomizer.done")}
        </Button>
      </div>
    </div>
  );
};
