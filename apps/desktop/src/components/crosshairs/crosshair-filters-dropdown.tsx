import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Check, Filter } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { FilterMode } from "@/lib/store/slices/ui";
import { cn } from "@/lib/utils";

type CrosshairFiltersDropdownProps = {
  crosshairs: PublishedCrosshairDto[];
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  filterMode: FilterMode;
  onFilterModeChange: (filterMode: FilterMode) => void;
};

const CrosshairHeroFilter = ({
  crosshairs,
  selectedHeroes,
  onHeroesChange,
}: {
  crosshairs: PublishedCrosshairDto[];
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
}) => {
  const { t } = useTranslation();
  const availableHeroes = Array.from(
    new Set(
      crosshairs
        .flatMap((crosshair) => crosshair.heroes)
        .filter((hero): hero is string => Boolean(hero)),
    ),
  ).sort();

  const hasDefaultHeroes = crosshairs.some(
    (crosshair) =>
      crosshair.heroes.length === 0 ||
      crosshair.heroes.includes("Default") ||
      crosshair.heroes.length === 0,
  );
  if (hasDefaultHeroes && !availableHeroes.includes("Default")) {
    availableHeroes.unshift("Default");
  }

  const handleHeroToggle = (hero: string) => {
    const newSelectedHeroes = selectedHeroes.includes(hero)
      ? selectedHeroes.filter((h) => h !== hero)
      : [...selectedHeroes, hero];
    onHeroesChange(newSelectedHeroes);
  };

  const getHeroDisplayName = (hero: string) => {
    if (hero === "Default") {
      return "General/Default";
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

const CrosshairTagFilter = ({
  crosshairs,
  selectedTags,
  onTagsChange,
}: {
  crosshairs: PublishedCrosshairDto[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}) => {
  const { t } = useTranslation();
  const availableTags = Array.from(
    new Set(crosshairs.flatMap((crosshair) => crosshair.tags)),
  ).sort();

  const handleTagToggle = (tag: string) => {
    const newSelectedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    onTagsChange(newSelectedTags);
  };

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <Label className='font-medium text-sm'>
        {t("crosshairs.filters.tags")}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className='w-[180px] justify-start'
            size='sm'
            variant='outline'>
            <span className='truncate'>
              {selectedTags.length === 0
                ? t("crosshairs.filters.allTags")
                : selectedTags.length === 1
                  ? selectedTags[0]
                  : `${selectedTags.length} ${t("filters.selected")}`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-[240px] p-0'>
          <Command>
            <CommandInput placeholder={t("crosshairs.filters.searchTags")} />
            <CommandList>
              <CommandEmpty>{t("crosshairs.filters.noTagsFound")}</CommandEmpty>
              <CommandGroup>
                {availableTags.map((tag) => (
                  <CommandItem key={tag} onSelect={() => handleTagToggle(tag)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 flex-shrink-0",
                        selectedTags.includes(tag)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className='truncate'>{tag}</span>
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

const CrosshairFiltersDropdown = ({
  crosshairs,
  selectedHeroes,
  onHeroesChange,
  selectedTags,
  onTagsChange,
  filterMode,
  onFilterModeChange,
}: CrosshairFiltersDropdownProps) => {
  const { t } = useTranslation();
  const hasActiveFilters = selectedHeroes.length > 0 || selectedTags.length > 0;
  const totalActiveFilters = selectedHeroes.length + selectedTags.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className='relative'
          size='iconExpand'
          icon={<Filter className='h-4 w-4' />}
          variant={hasActiveFilters ? "default" : "outline"}>
          {t("filters.filters")}
          {hasActiveFilters && (
            <span className='ml-1 rounded-full bg-background px-1.5 py-0.5 text-foreground text-xs'>
              {totalActiveFilters}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='space-y-4 p-4'>
        <div className='space-y-2'>
          <Label className='font-medium text-sm'>{t("filters.mode")}</Label>
          <div className='flex gap-2'>
            <Button
              onClick={() => onFilterModeChange("include")}
              size='sm'
              variant={filterMode === "include" ? "default" : "outline"}>
              {t("filters.include")}
            </Button>
            <Button
              onClick={() => onFilterModeChange("exclude")}
              size='sm'
              variant={filterMode === "exclude" ? "default" : "outline"}>
              {t("filters.exclude")}
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <CrosshairHeroFilter
          crosshairs={crosshairs}
          onHeroesChange={onHeroesChange}
          selectedHeroes={selectedHeroes}
        />
        <CrosshairTagFilter
          crosshairs={crosshairs}
          onTagsChange={onTagsChange}
          selectedTags={selectedTags}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CrosshairFiltersDropdown;
