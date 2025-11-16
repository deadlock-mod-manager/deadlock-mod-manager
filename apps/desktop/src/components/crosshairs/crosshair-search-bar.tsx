import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ArrowUpDown, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { SortType } from "@/lib/constants";
import type { FilterMode } from "@/lib/store/slices/ui";
import CrosshairFiltersDropdown from "./crosshair-filters-dropdown";

type CrosshairSearchBarProps = {
  query: string;
  setQuery: (query: string) => void;
  sortType: SortType;
  setSortType: (sortType: SortType) => void;
  crosshairs: PublishedCrosshairDto[];
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  filterMode: FilterMode;
  onFilterModeChange: (filterMode: FilterMode) => void;
};

const CrosshairSearchBar = ({
  query,
  setQuery,
  sortType,
  setSortType,
  crosshairs,
  selectedHeroes,
  onHeroesChange,
  selectedTags,
  onTagsChange,
  filterMode,
  onFilterModeChange,
}: CrosshairSearchBarProps) => {
  const { t } = useTranslation();

  const getHeroDisplayName = (hero: string) => {
    if (hero === "Default") {
      return "General/Default";
    }
    return hero;
  };

  const removeHero = (heroToRemove: string) => {
    onHeroesChange(selectedHeroes.filter((hero) => hero !== heroToRemove));
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(selectedTags.filter((tag) => tag !== tagToRemove));
  };

  const clearAllFilters = () => {
    onHeroesChange([]);
    onTagsChange([]);
  };

  const hasActiveFilters = selectedHeroes.length > 0 || selectedTags.length > 0;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <SearchInput
            className='w-80'
            id='crosshair-search'
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("crosshairs.filters.searchPlaceholder")}
            value={query}
          />
          <CrosshairFiltersDropdown
            crosshairs={crosshairs}
            filterMode={filterMode}
            onFilterModeChange={onFilterModeChange}
            onHeroesChange={onHeroesChange}
            onTagsChange={onTagsChange}
            selectedHeroes={selectedHeroes}
            selectedTags={selectedTags}
          />
        </div>
        <div className='flex items-center gap-4'>
          <Select onValueChange={setSortType} value={sortType}>
            <SelectTrigger>
              <ArrowUpDown className='mr-2 h-4 w-4' />
              <SelectValue placeholder={t("filters.sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(SortType).map((type) => (
                  <SelectItem className='capitalize' key={type} value={type}>
                    {t(`sorting.${type.replace(/\s+/g, "").toLowerCase()}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-sm'>
            {filterMode === "include"
              ? t("filters.includingFilters")
              : t("filters.excludingFilters")}
          </span>

          {selectedHeroes.map((hero) => (
            <Badge
              className='flex items-center gap-1'
              key={`hero-${hero}`}
              variant='secondary'>
              {t("filters.heroLabel")} {getHeroDisplayName(hero)}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => removeHero(hero)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}

          {selectedTags.map((tag) => (
            <Badge
              className='flex items-center gap-1'
              key={`tag-${tag}`}
              variant='secondary'>
              {t("crosshairs.filters.tagLabel")} {tag}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => removeTag(tag)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}

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

export default CrosshairSearchBar;
