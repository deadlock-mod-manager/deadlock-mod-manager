import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ArrowUpDown, Star, X } from "@deadlock-mods/ui/icons";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import { usePersistedStore } from "@/lib/store";
import { cn, formatAddedDate, isAddedFilterActive } from "@/lib/utils";
import {
  getModCategoryDisplayName,
  SortType,
  TimePeriod,
  timePeriodLabelKey,
} from "@/lib/constants";
import {
  type AddedFilter,
  type AudioQuickFilter,
  DEFAULT_ADDED_FILTER,
  type FilterMode,
  type MapQuickFilter,
} from "@/lib/store/slices/ui";
import CategoryFilter from "./category-filter";
import FiltersDropdown from "./filters-dropdown";
import HeroFilter from "./hero-filter";

type SearchBarProps = {
  className?: string;
  inputGroupClassName?: string;
  searchContainerClassName?: string;
  searchInputClassName?: string;
  query: string;
  setQuery: (query: string) => void;
  sortType?: SortType;
  setSortType?: (sortType: SortType) => void;
  /** Source for the hero and category menus; only these fields are read. */
  mods: Array<
    Pick<ModDto, "category" | "hero" | "name"> & {
      detectedHero?: string | null;
      heroOverride?: string | null;
    }
  >;
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
  hideNSFW: boolean;
  onHideNSFWChange: (hideNSFW: boolean) => void;
  // Local libraries filter by audio/map flags; the store has section tabs.
  audioQuickFilter?: AudioQuickFilter;
  onAudioQuickFilterChange?: (value: AudioQuickFilter) => void;
  mapQuickFilter?: MapQuickFilter;
  onMapQuickFilterChange?: (value: MapQuickFilter) => void;
  hideOutdated: boolean;
  onHideOutdatedChange: (hideOutdated: boolean) => void;
  timePeriod?: TimePeriod;
  onTimePeriodChange?: (timePeriod: TimePeriod) => void;
  filterMode: FilterMode;
  onFilterModeChange: (filterMode: FilterMode) => void;
  showSortControl?: boolean;
  showTimePeriodControl?: boolean;
  showFavoritesFilter?: boolean;
  showFavoritesOnly?: boolean;
  onShowFavoritesOnlyChange?: (value: boolean) => void;
  hideMapFilter?: boolean;
  addedFilter?: AddedFilter;
  onAddedFilterChange?: (value: AddedFilter) => void;
};

const SearchBar = ({
  className,
  inputGroupClassName,
  searchContainerClassName,
  searchInputClassName,
  query,
  setQuery,
  sortType,
  setSortType,
  mods,
  selectedCategories,
  onCategoriesChange,
  selectedHeroes,
  onHeroesChange,
  hideNSFW,
  onHideNSFWChange,
  audioQuickFilter,
  onAudioQuickFilterChange,
  mapQuickFilter,
  onMapQuickFilterChange,
  hideOutdated,
  onHideOutdatedChange,
  timePeriod,
  onTimePeriodChange,
  filterMode,
  onFilterModeChange,
  showSortControl = true,
  showTimePeriodControl = true,
  showFavoritesFilter = false,
  showFavoritesOnly = false,
  onShowFavoritesOnlyChange,
  hideMapFilter,
  addedFilter,
  onAddedFilterChange,
}: SearchBarProps) => {
  const { t } = useTranslation();
  const addedActive = addedFilter ? isAddedFilterActive(addedFilter) : false;
  const effectiveTimePeriod = timePeriod ?? TimePeriod.ALL_TIME;
  const favoritesCount = usePersistedStore((state) => state.favorites.length);

  const getHeroDisplayName = (hero: string) => {
    if (hero === "None") {
      return "General/Other";
    }
    return hero;
  };

  const removeCategory = (categoryToRemove: string) => {
    onCategoriesChange(
      selectedCategories.filter((cat) => cat !== categoryToRemove),
    );
  };

  const removeHero = (heroToRemove: string) => {
    onHeroesChange(selectedHeroes.filter((hero) => hero !== heroToRemove));
  };

  const clearAllFilters = () => {
    onCategoriesChange([]);
    onHeroesChange([]);
    onHideNSFWChange(false);
    onAudioQuickFilterChange?.("off");
    onMapQuickFilterChange?.("off");
    onHideOutdatedChange(false);
    onTimePeriodChange?.(TimePeriod.ALL_TIME);
    onFilterModeChange("include");
    onShowFavoritesOnlyChange?.(false);
    onAddedFilterChange?.(DEFAULT_ADDED_FILTER);
  };

  const addedFilterLabel = (filter: AddedFilter) => {
    if (filter.period !== "custom") {
      return t(`filters.addedPeriod.${filter.period}`);
    }
    const from = formatAddedDate(filter.from);
    const to = formatAddedDate(filter.to);
    if (from && to) return t("filters.addedBetween", { from, to });
    return from
      ? t("filters.addedSince", { date: from })
      : t("filters.addedUntil", { date: to });
  };

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    hideNSFW ||
    (audioQuickFilter ?? "off") !== "off" ||
    (!hideMapFilter && (mapQuickFilter ?? "off") !== "off") ||
    hideOutdated ||
    showFavoritesOnly ||
    addedActive ||
    (showTimePeriodControl && effectiveTimePeriod !== TimePeriod.ALL_TIME);

  const showTrailing =
    showFavoritesFilter || Boolean(showSortControl && sortType && setSortType);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          inputGroupClassName,
        )}>
        <div
          className={cn(
            "min-w-48 max-w-sm flex-1 overflow-visible",
            searchContainerClassName,
          )}>
          <SearchInput
            className={cn("w-full", searchInputClassName)}
            id='search'
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mods.searchPlaceholder")}
            value={query}
          />
        </div>
        <HeroFilter
          mods={mods}
          onHeroesChange={onHeroesChange}
          selectedHeroes={selectedHeroes}
        />
        <CategoryFilter
          mods={mods}
          onCategoriesChange={onCategoriesChange}
          selectedCategories={selectedCategories}
        />
        <FiltersDropdown
          addedFilter={addedFilter}
          audioQuickFilter={audioQuickFilter}
          filterMode={filterMode}
          hideMapFilter={hideMapFilter}
          hideNSFW={hideNSFW}
          hideOutdated={hideOutdated}
          mapQuickFilter={mapQuickFilter}
          onAddedFilterChange={onAddedFilterChange}
          onAudioQuickFilterChange={onAudioQuickFilterChange}
          onFilterModeChange={onFilterModeChange}
          onHideNSFWChange={onHideNSFWChange}
          onHideOutdatedChange={onHideOutdatedChange}
          onMapQuickFilterChange={onMapQuickFilterChange}
          onTimePeriodChange={
            showTimePeriodControl ? onTimePeriodChange : undefined
          }
          timePeriod={effectiveTimePeriod}
        />
        {showTrailing && (
          <div className='ml-auto flex items-center gap-2'>
            {showFavoritesFilter && (
              <Button
                aria-pressed={showFavoritesOnly}
                className={cn(
                  "gap-2 px-3",
                  showFavoritesOnly
                    ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-300"
                    : "font-normal text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onShowFavoritesOnlyChange?.(!showFavoritesOnly)}
                variant='outline'>
                <Star
                  className={cn(
                    "h-4 w-4",
                    showFavoritesOnly && "fill-yellow-400 text-yellow-400",
                  )}
                />
                {t("favorites.title")}
                {favoritesCount > 0 && (
                  <span className='rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular-nums leading-4'>
                    {favoritesCount}
                  </span>
                )}
              </Button>
            )}
            {showSortControl && sortType && setSortType && (
              <Select onValueChange={setSortType} value={sortType}>
                <SelectTrigger
                  aria-label={t("filters.sortBy")}
                  className='w-fit gap-1'>
                  <ArrowUpDown className='mr-1.5 h-4 w-4 text-muted-foreground' />
                  <SelectValue placeholder={t("filters.sortBy")} />
                </SelectTrigger>
                <SelectContent align='end'>
                  <SelectGroup>
                    {Object.values(SortType).map((type) => (
                      <SelectItem
                        className='capitalize'
                        key={type}
                        value={type}>
                        {t(
                          `sorting.${type.replaceAll(/\s+/g, "").toLowerCase()}`,
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-sm'>
            {filterMode === "include"
              ? t("filters.includingFilters")
              : t("filters.excludingFilters")}
          </span>

          {/* Category badges */}
          {selectedCategories.map((category) => (
            <Badge
              className='flex items-center gap-1'
              key={`category-${category}`}
              variant='secondary'>
              {t("filters.categoryLabel")} {getModCategoryDisplayName(category)}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => removeCategory(category)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}

          {/* Hero badges */}
          {selectedHeroes.map((hero) => (
            <Badge
              className='flex items-center gap-1'
              key={`hero-${hero}`}
              variant='secondary'>
              {t("filters.heroLabel")}
              {hero !== "None" && <HeroIcon className='h-4 w-4' hero={hero} />}
              {getHeroDisplayName(hero)}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => removeHero(hero)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}

          {/* NSFW filter badge */}
          {hideNSFW && (
            <Badge className='flex items-center gap-1' variant='destructive'>
              {t("filters.hideNSFW")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onHideNSFWChange(false)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Audio filter badge */}
          {audioQuickFilter && audioQuickFilter !== "off" && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {audioQuickFilter === "only"
                ? t("filters.audioModsOnly")
                : t("filters.excludeAudioMods")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onAudioQuickFilterChange?.("off")}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {!hideMapFilter && mapQuickFilter && mapQuickFilter !== "off" && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {mapQuickFilter === "only"
                ? t("filters.mapsModsOnly")
                : t("filters.excludeMapsMods")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onMapQuickFilterChange?.("off")}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Broken/Outdated filter badge */}
          {hideOutdated && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {t("filters.hideOutdated")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onHideOutdatedChange(false)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Time period badge */}
          {showTimePeriodControl &&
            effectiveTimePeriod !== TimePeriod.ALL_TIME && (
              <Badge className='flex items-center gap-1' variant='secondary'>
                {t(timePeriodLabelKey(effectiveTimePeriod))}
                <button
                  className='ml-1 rounded-full p-0.5 hover:bg-muted'
                  onClick={() => onTimePeriodChange?.(TimePeriod.ALL_TIME)}
                  type='button'>
                  <X className='h-3 w-3' />
                </button>
              </Badge>
            )}

          {addedFilter && addedActive && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {t("filters.addedLabel")} {addedFilterLabel(addedFilter)}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onAddedFilterChange?.(DEFAULT_ADDED_FILTER)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {showFavoritesOnly && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              <Star className='h-3 w-3 fill-yellow-400 text-yellow-400' />
              {t("favorites.title")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowFavoritesOnlyChange?.(false)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Clear all button */}
          <button
            className='text-muted-foreground text-xs underline hover:text-foreground'
            onClick={clearAllFilters}
            type='button'>
            {t("filters.clearAll")}
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(SearchBar);
