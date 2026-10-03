import { DeadlockHeroes } from "@deadlock-mods/shared";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Check, RotateCcw, Settings } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import type { ResolvedModHero } from "@/lib/mods/hero-resolution";
import { usePersistedStore } from "@/lib/store";

const HERO_OVERRIDE_OPTIONS = Object.values(DeadlockHeroes).sort((a, b) =>
  a.localeCompare(b),
);

interface HeroOverridePickerProps {
  remoteId: string;
  resolvedHero: ResolvedModHero;
}

export const HeroOverridePicker = ({
  remoteId,
  resolvedHero,
}: HeroOverridePickerProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const setHeroOverride = usePersistedStore((state) => state.setHeroOverride);
  const selectedValue =
    resolvedHero.hasOverride && resolvedHero.hero === null
      ? null
      : resolvedHero.hero;

  const handleOverride = (heroOverride: string | null | undefined) => {
    setHeroOverride(remoteId, heroOverride);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t("modDetail.changeHero", {
                defaultValue: "Change hero",
              })}
              className='ml-auto h-7 w-7 shrink-0 opacity-80 group-hover:opacity-100'
              size='icon'
              variant='ghost'>
              <Settings className='h-3.5 w-3.5' />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {t("modDetail.changeHero", { defaultValue: "Change hero" })}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align='start' className='w-[260px] p-0'>
        <Command>
          <CommandInput placeholder={t("filters.searchHeroes")} />
          <CommandList>
            <CommandEmpty>{t("filters.noHeroesFound")}</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => handleOverride(undefined)}>
                <RotateCcw className='h-5 w-5 shrink-0 p-0.5' />
                <span>
                  {t("modDetail.heroOverrideAutomatic", {
                    defaultValue: "Use automatic",
                  })}
                </span>
              </CommandItem>
              <CommandItem onSelect={() => handleOverride(null)}>
                <HeroIcon hero={null} />
                <span>
                  {t("modDetail.generalOther", {
                    defaultValue: "General/Other",
                  })}
                </span>
                {resolvedHero.hasOverride && selectedValue === null && (
                  <Check className='ml-auto h-4 w-4 shrink-0' />
                )}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {HERO_OVERRIDE_OPTIONS.map((heroName) => (
                <CommandItem
                  key={heroName}
                  onSelect={() => handleOverride(heroName)}>
                  <HeroIcon hero={heroName} />
                  <span className='truncate'>{heroName}</span>
                  {resolvedHero.hasOverride && selectedValue === heroName && (
                    <Check className='ml-auto h-4 w-4 shrink-0' />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
