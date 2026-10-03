import { DeadlockHeroes, type ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@deadlock-mods/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Check } from "@deadlock-mods/ui/icons";
import { CaretDownIcon, UserCircleIcon } from "@phosphor-icons/react";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import { resolveLocalModHero } from "@/lib/mods/hero-resolution";
import { cn } from "@/lib/utils";
import { toolbarTriggerClass } from "./filters-trigger-button";

type HeroFilterProps = {
  mods: Array<
    ModDto & { detectedHero?: string | null; heroOverride?: string | null }
  >;
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
};

const HeroFilter = ({
  mods,
  selectedHeroes,
  onHeroesChange,
}: HeroFilterProps) => {
  const { t } = useTranslation();

  // Always offer the full roster (plus anything selected) so the list doesn't
  // shrink to the current selection when `mods` is already hero-filtered.
  const modHeroes = useMemo(() => {
    const heroes = new Set<string>(Object.values(DeadlockHeroes));
    let hasGeneral = false;
    for (const mod of mods) {
      const hero = resolveLocalModHero(mod).hero;
      if (hero) {
        heroes.add(hero);
      } else {
        hasGeneral = true;
      }
    }
    return { heroes, hasGeneral };
  }, [mods]);

  const availableHeroes = useMemo(() => {
    const heroes = new Set(modHeroes.heroes);
    for (const hero of selectedHeroes) {
      if (hero !== "None") {
        heroes.add(hero);
      }
    }
    const sorted = Array.from(heroes).sort((a, b) => a.localeCompare(b));
    return modHeroes.hasGeneral || selectedHeroes.includes("None")
      ? ["None", ...sorted]
      : sorted;
  }, [modHeroes, selectedHeroes]);

  const handleHeroToggle = useCallback(
    (hero: string) => {
      const newSelectedHeroes = selectedHeroes.includes(hero)
        ? selectedHeroes.filter((h) => h !== hero)
        : [...selectedHeroes, hero];
      onHeroesChange(newSelectedHeroes);
    },
    [selectedHeroes, onHeroesChange],
  );

  const getHeroDisplayName = (hero: string) => {
    if (hero === "None") {
      return "General/Other";
    }
    return hero;
  };

  const getButtonDisplayText = () => {
    if (selectedHeroes.length === 0) {
      return t("filters.allHeroes");
    }
    if (selectedHeroes.length === 1) {
      return getHeroDisplayName(selectedHeroes[0]);
    }
    return `${selectedHeroes.length} ${t("filters.selected")}`;
  };

  const singleHero = selectedHeroes.length === 1 ? selectedHeroes[0] : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("filters.hero")}
          className={cn(
            "max-w-[200px] gap-2 px-3",
            toolbarTriggerClass(selectedHeroes.length > 0),
          )}
          variant='outline'>
          {singleHero && singleHero !== "None" ? (
            <HeroIcon className='h-4 w-4' hero={singleHero} />
          ) : (
            <UserCircleIcon className='h-4 w-4 shrink-0' />
          )}
          <span className='truncate'>{getButtonDisplayText()}</span>
          <CaretDownIcon className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[240px] p-0'>
        <Command>
          <CommandInput placeholder={t("filters.searchHeroes")} />
          <CommandList>
            <CommandEmpty>{t("filters.noHeroesFound")}</CommandEmpty>
            <CommandGroup>
              {availableHeroes.map((hero) => {
                const isSelected = selectedHeroes.includes(hero);
                return (
                  <CommandItem
                    aria-selected={isSelected}
                    key={hero}
                    onSelect={() => handleHeroToggle(hero)}>
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary/50",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-60",
                      )}>
                      {isSelected && <Check className='h-3 w-3' />}
                    </span>
                    <HeroIcon hero={hero === "None" ? null : hero} />
                    <span className='truncate'>{getHeroDisplayName(hero)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedHeroes.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className='justify-center text-muted-foreground'
                    onSelect={() => onHeroesChange([])}>
                    {t("filters.clearAll")}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default memo(HeroFilter);
