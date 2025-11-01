import { DeadlockHeroes } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useState } from "react";
import {
  LuCheck,
  LuChevronDown,
  LuFilter,
  LuSearch,
  LuX,
} from "react-icons/lu";
import type { useModFilters } from "@/hooks/use-mod-filters";

enum ModCategory {
  SKINS = "Skins",
  GAMEPLAY_MODIFICATIONS = "Gameplay Modifications",
  HUD = "HUD",
  MODEL_REPLACEMENT = "Model Replacement",
  OTHER_MISC = "Other/Misc",
}

const MOD_CATEGORIES = Object.values(ModCategory);
const HEROES = Object.values(DeadlockHeroes).sort();

interface ModsFiltersProps {
  filterState: ReturnType<typeof useModFilters>;
}

export const ModsFilters = ({ filterState }: ModsFiltersProps) => {
  const {
    filters,
    searchInput,
    setSearchInput,
    updateFilters,
    toggleCategory,
    toggleHero,
    clearAllFilters,
    activeFiltersCount,
  } = filterState;

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);

  return (
    <div className='space-y-4'>
      {/* Search Bar */}
      <div className='relative'>
        <LuSearch className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          className='pl-9 pr-9'
          placeholder='Search mods by name, author, or description...'
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button
            type='button'
            className='absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground'
            onClick={() => setSearchInput("")}>
            <LuX className='h-4 w-4' />
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className='flex flex-wrap items-center gap-3'>
        {/* Category Filter */}
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              className={cn(
                "justify-between",
                filters.categories.length > 0 &&
                  "border-primary/50 bg-primary/5",
              )}>
              <LuFilter className='mr-2 h-4 w-4' />
              Categories
              {filters.categories.length > 0 && (
                <Badge className='ml-2 h-5 px-1.5' variant='secondary'>
                  {filters.categories.length}
                </Badge>
              )}
              <LuChevronDown className='ml-2 h-4 w-4' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[200px] p-0' align='start'>
            <Command>
              <CommandInput placeholder='Search categories...' />
              <CommandList>
                <CommandEmpty>No categories found.</CommandEmpty>
                <CommandGroup>
                  {MOD_CATEGORIES.map((category) => (
                    <CommandItem
                      key={category}
                      onSelect={() => toggleCategory(category)}>
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                          filters.categories.includes(category)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted",
                        )}>
                        {filters.categories.includes(category) && (
                          <LuCheck className='h-3 w-3' />
                        )}
                      </div>
                      {category}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Hero Filter */}
        <Popover open={heroOpen} onOpenChange={setHeroOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              className={cn(
                "justify-between",
                filters.heroes.length > 0 && "border-primary/50 bg-primary/5",
              )}>
              <LuFilter className='mr-2 h-4 w-4' />
              Heroes
              {filters.heroes.length > 0 && (
                <Badge className='ml-2 h-5 px-1.5' variant='secondary'>
                  {filters.heroes.length}
                </Badge>
              )}
              <LuChevronDown className='ml-2 h-4 w-4' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[200px] p-0' align='start'>
            <Command>
              <CommandInput placeholder='Search heroes...' />
              <CommandList>
                <CommandEmpty>No heroes found.</CommandEmpty>
                <CommandGroup>
                  {HEROES.map((hero) => (
                    <CommandItem key={hero} onSelect={() => toggleHero(hero)}>
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                          filters.heroes.includes(hero)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted",
                        )}>
                        {filters.heroes.includes(hero) && (
                          <LuCheck className='h-3 w-3' />
                        )}
                      </div>
                      {hero}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Separator orientation='vertical' className='h-8' />

        {/* Sort */}
        <Select
          value={filters.sortBy}
          onValueChange={(value) =>
            updateFilters({ sortBy: value as typeof filters.sortBy })
          }>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Sort by' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='default'>Default</SelectItem>
            <SelectItem value='lastupdated'>Last Updated</SelectItem>
            <SelectItem value='downloadcount'>Download Count</SelectItem>
            <SelectItem value='rating'>Rating</SelectItem>
            <SelectItem value='releasedate'>Release Date</SelectItem>
          </SelectContent>
        </Select>

        {/* Filter Mode */}
        <Select
          value={filters.filterMode}
          onValueChange={(value) =>
            updateFilters({ filterMode: value as typeof filters.filterMode })
          }>
          <SelectTrigger className='w-[140px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='include'>Include</SelectItem>
            <SelectItem value='exclude'>Exclude</SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation='vertical' className='h-8' />

        {/* Quick Filters */}
        <div className='flex items-center gap-2'>
          <label className='flex cursor-pointer items-center gap-2 text-sm'>
            <Switch
              checked={filters.audioOnly}
              onCheckedChange={(checked) =>
                updateFilters({ audioOnly: checked })
              }
            />
            Audio Only
          </label>
        </div>

        <div className='flex items-center gap-2'>
          <label className='flex cursor-pointer items-center gap-2 text-sm'>
            <Switch
              checked={filters.showNSFW}
              onCheckedChange={(checked) =>
                updateFilters({ showNSFW: checked })
              }
            />
            NSFW
          </label>
        </div>

        {/* Clear Filters */}
        {activeFiltersCount > 0 && (
          <>
            <Separator orientation='vertical' className='h-8' />
            <Button variant='ghost' size='sm' onClick={clearAllFilters}>
              <LuX className='mr-2 h-4 w-4' />
              Clear All ({activeFiltersCount})
            </Button>
          </>
        )}
      </div>

      {/* Active Filters Display */}
      {(filters.categories.length > 0 || filters.heroes.length > 0) && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-sm'>Active filters:</span>
          {filters.categories.map((category) => (
            <Badge key={category} variant='secondary' className='gap-1 pr-1'>
              {category}
              <button
                type='button'
                onClick={() => toggleCategory(category)}
                className='ml-1 rounded-full hover:bg-muted'>
                <LuX className='h-3 w-3' />
              </button>
            </Badge>
          ))}
          {filters.heroes.map((hero) => (
            <Badge key={hero} variant='secondary' className='gap-1 pr-1'>
              {hero}
              <button
                type='button'
                onClick={() => toggleHero(hero)}
                className='ml-1 rounded-full hover:bg-muted'>
                <LuX className='h-3 w-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
