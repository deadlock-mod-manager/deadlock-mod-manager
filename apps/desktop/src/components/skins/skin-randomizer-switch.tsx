import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { ChevronDown, Shuffle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { HeaderToggle } from "@/components/skins/header-toggle";
import type { HeroModGroup } from "@/lib/mods/hero-mods";
import { bulkSelectableSkins } from "@/lib/mods/skin-randomizer";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface SkinRandomizerSwitchProps {
  /** Every hero's mods, for the selections that reach across heroes. */
  groups: ReadonlyMap<string, HeroModGroup<LocalMod>>;
  /** How many heroes have enough in their pool to be rolled on launch. */
  randomizedHeroCount: number;
}

/** The page-wide randomizer switch and the selections that span every hero. */
export const SkinRandomizerSwitch = ({
  groups,
  randomizedHeroCount,
}: SkinRandomizerSwitchProps) => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.skinRandomizerEnabled);
  const setSkinRandomizerEnabled = usePersistedStore(
    (state) => state.setSkinRandomizerEnabled,
  );
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
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

  const heroesWithSkins = [...groups]
    .filter(([, heroGroup]) => heroGroup.skins.length > 0)
    .map(([heroName]) => heroName);

  const setEnabled = (checked: boolean) => {
    setSkinRandomizerEnabled(checked);
    if (checked) {
      markFeatureUsed("skin-randomizer");
    }
  };

  return (
    <HeaderToggle
      checked={enabled}
      description={
        enabled
          ? t("skins.randomizer.activeSummary", { count: randomizedHeroCount })
          : t("skins.randomizer.inactiveSummary")
      }
      icon={<Shuffle />}
      id='skin-randomizer'
      onCheckedChange={setEnabled}
      title={t("skins.randomizer.title")}
      tone='gold'>
      <Separator className='h-5' orientation='vertical' />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className='h-8 gap-1 px-2' size='sm' variant='ghost'>
            {t("skins.randomizer.bulk")}
            <ChevronDown className='h-3.5 w-3.5' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
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
    </HeaderToggle>
  );
};
