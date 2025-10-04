import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Check } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type HeroFilterProps = {
  mods: ModDto[];
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
};

const HeroFilter = ({
  mods,
  selectedHeroes,
  onHeroesChange,
}: HeroFilterProps) => {
  const { t } = useTranslation();
  // Get heroes that actually have mods available
  const availableHeroes = Array.from(
    new Set(
      mods
        .map((mod) => mod.hero)
        .filter((hero): hero is string => Boolean(hero)),
    ),
  ).sort();

  // Add "None" option for mods without specific heroes
  const hasNonHeroMods = mods.some((mod) => !mod.hero);
  if (hasNonHeroMods && !availableHeroes.includes("None")) {
    availableHeroes.unshift("None");
  }

  const handleHeroToggle = (hero: string) => {
    const newSelectedHeroes = selectedHeroes.includes(hero)
      ? selectedHeroes.filter((h) => h !== hero)
      : [...selectedHeroes, hero];
    onHeroesChange(newSelectedHeroes);
  };

  const getHeroDisplayName = (hero: string) => {
    if (hero === "None") {
      return "General/Other";
    }
    return hero;
  };

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <Label className='font-medium text-sm'>{t("filters.hero")}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className='w-[180px] justify-start'
            size='sm'
            variant='outline'>
            <span className='truncate'>
              {selectedHeroes.length === 0
                ? t("filters.allHeroes")
                : selectedHeroes.length === 1
                  ? getHeroDisplayName(selectedHeroes[0])
                  : `${selectedHeroes.length} ${t("filters.selected")}`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-[240px] p-0'>
          <Command>
            <CommandInput placeholder={t("filters.searchHeroes")} />
            <CommandList>
              <CommandEmpty>{t("filters.noHeroesFound")}</CommandEmpty>
              <CommandGroup>
                {availableHeroes.map((hero) => (
                  <CommandItem
                    key={hero}
                    onSelect={() => handleHeroToggle(hero)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 flex-shrink-0",
                        selectedHeroes.includes(hero)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className='truncate'>{getHeroDisplayName(hero)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default HeroFilter;
