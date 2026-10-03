import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Label } from "@deadlock-mods/ui/components/label";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { ChevronDown, Shuffle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { HeroModGroup } from "@/lib/mods/hero-mods";
import {
  bulkSelectableSkins,
  canRandomizeSkin,
  RANDOMIZER_MIN_POOL,
} from "@/lib/mods/skin-randomizer";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

interface HeroRandomizerBarProps {
  hero: string;
  group: HeroModGroup<LocalMod>;
  /** Every hero's mods, for the selections that reach across heroes. */
  groups: ReadonlyMap<string, HeroModGroup<LocalMod>>;
  /** Skins and the default look that the next launch can land on. */
  poolSize: number;
  /** How many heroes have enough in their pool to be rolled on launch. */
  randomizedHeroCount: number;
}

/**
 * The skin randomizer in one strip: the page-wide switch and bulk selections,
 * and this hero's default look and quick selections next to them.
 */
export const HeroRandomizerBar = ({
  hero,
  group,
  groups,
  poolSize,
  randomizedHeroCount,
}: HeroRandomizerBarProps) => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.skinRandomizerEnabled);
  const setEnabled = usePersistedStore(
    (state) => state.setSkinRandomizerEnabled,
  );
  const defaultHeroes = usePersistedStore(
    (state) => state.randomizerDefaultHeroes,
  );
  const setRandomizerSkins = usePersistedStore(
    (state) => state.setRandomizerSkins,
  );
  const setRandomizerDefaultHeroes = usePersistedStore(
    (state) => state.setRandomizerDefaultHeroes,
  );
  const clearSelection = usePersistedStore(
    (state) => state.clearRandomizerSelection,
  );

  const hasSkins = group.skins.length > 0;
  const selectableSkinIds = group.skins
    .filter(canRandomizeSkin)
    .map((skin) => skin.remoteId);
  const heroesWithSkins = [...groups]
    .filter(([, heroGroup]) => heroGroup.skins.length > 0)
    .map(([heroName]) => heroName);
  const defaultSwitchId = `randomizer-default-${hero}`;

  const status =
    poolSize < RANDOMIZER_MIN_POOL
      ? t("skins.randomizer.heroNeedsMore", { count: poolSize })
      : enabled
        ? t("skins.randomizer.heroActive", { count: poolSize })
        : t("skins.randomizer.heroReady", { count: poolSize });

  return (
    <div className='mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2'>
      <div className='flex items-center gap-2'>
        <Shuffle className='h-4 w-4 shrink-0 text-muted-foreground' />
        <Switch
          checked={enabled}
          id='skin-randomizer'
          onCheckedChange={setEnabled}
        />
        <Label className='font-semibold text-sm' htmlFor='skin-randomizer'>
          {t("skins.randomizer.title")}
        </Label>
      </div>
      {hasSkins && (
        <>
          <Separator className='h-5' orientation='vertical' />
          <span className='min-w-0 flex-1 truncate text-muted-foreground text-sm'>
            {status}
          </span>
          <div className='flex items-center gap-2'>
            <Switch
              checked={defaultHeroes[hero] === true}
              id={defaultSwitchId}
              onCheckedChange={(checked) =>
                setRandomizerDefaultHeroes([hero], checked)
              }
            />
            <Label className='text-sm' htmlFor={defaultSwitchId}>
              {t("skins.randomizer.includeDefault")}
            </Label>
          </div>
          <div className='flex gap-1'>
            <Button
              className='h-7 px-2'
              disabled={selectableSkinIds.length === 0}
              onClick={() => setRandomizerSkins(selectableSkinIds, true)}
              size='sm'
              variant='ghost'>
              {t("skins.randomizer.selectAll")}
            </Button>
            <Button
              className='h-7 px-2'
              onClick={() =>
                setRandomizerSkins(
                  group.skins.map((skin) => skin.remoteId),
                  false,
                )
              }
              size='sm'
              variant='ghost'>
              {t("skins.randomizer.selectNone")}
            </Button>
          </div>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn("h-7 gap-1 px-2", !hasSkins && "ml-auto")}
            size='sm'
            variant='outline'>
            {t("skins.randomizer.bulk")}
            <ChevronDown className='h-3.5 w-3.5' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel className='font-normal text-muted-foreground text-xs'>
            {enabled
              ? t("skins.randomizer.activeSummary", {
                  count: randomizedHeroCount,
                })
              : t("skins.randomizer.inactiveSummary")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              setRandomizerSkins(
                bulkSelectableSkins(groups, defaultHeroes),
                true,
              )
            }>
            {t("skins.randomizer.selectAllHeroes")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setRandomizerDefaultHeroes(heroesWithSkins, true)}>
            {t("skins.randomizer.includeDefaultAll")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setRandomizerDefaultHeroes(heroesWithSkins, false)}>
            {t("skins.randomizer.excludeDefaultAll")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='text-destructive focus:bg-destructive/10 focus:text-destructive'
            onSelect={clearSelection}>
            {t("skins.randomizer.clearAll")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
