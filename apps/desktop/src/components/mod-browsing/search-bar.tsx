import type { ModDto } from "@deadlock-mods/shared";
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
import { ModCategory, SortType } from "@/lib/constants";
import type { FilterMode } from "@/lib/store/slices/ui";
import FiltersDropdown from "./filters-dropdown";

type SearchBarProps = {
  query: string;
  setQuery: (query: string) => void;
  sortType: SortType;
  setSortType: (sortType: SortType) => void;
  mods: ModDto[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
  showNSFW: boolean;
  onShowNSFWChange: (showNSFW: boolean) => void;
  showAudioOnly: boolean;
  onShowAudioOnlyChange: (showAudioOnly: boolean) => void;
  filterMode: FilterMode;
  onFilterModeChange: (filterMode: FilterMode) => void;
};

const SearchBar = ({
  query,
  setQuery,
  sortType,
  setSortType,
  mods,
  selectedCategories,
  onCategoriesChange,
  selectedHeroes,
  onHeroesChange,
  showNSFW,
  onShowNSFWChange,
  showAudioOnly,
  onShowAudioOnlyChange,
  filterMode,
  onFilterModeChange,
}: SearchBarProps) => {
  const { t } = useTranslation();
  const getHeroDisplayName = (hero: string) => {
    if (hero === "None") {
      return "General/Other";
    }
    return hero;
  };

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case ModCategory.GAMEPLAY_MODIFICATIONS:
        return "Gameplay";
      case ModCategory.MODEL_REPLACEMENT:
        return "Models";
      case ModCategory.OTHER_MISC:
        return "Other";
      default:
        return category;
    }
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
    onShowNSFWChange(false);
    onShowAudioOnlyChange(false);
  };

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    showNSFW ||
    showAudioOnly;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <SearchInput
            className='w-80'
            id='search'
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mods.searchPlaceholder")}
            value={query}
          />
          <FiltersDropdown
            filterMode={filterMode}
            mods={mods}
            onCategoriesChange={onCategoriesChange}
            onFilterModeChange={onFilterModeChange}
            onHeroesChange={onHeroesChange}
            onShowAudioOnlyChange={onShowAudioOnlyChange}
            onShowNSFWChange={onShowNSFWChange}
            selectedCategories={selectedCategories}
            selectedHeroes={selectedHeroes}
            showAudioOnly={showAudioOnly}
            showNSFW={showNSFW}
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
              {t("filters.categoryLabel")} {getCategoryDisplayName(category)}
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
              {t("filters.heroLabel")} {getHeroDisplayName(hero)}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => removeHero(hero)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}

          {/* NSFW filter badge */}
          {showNSFW && (
            <Badge className='flex items-center gap-1' variant='destructive'>
              {filterMode === "include"
                ? t("filters.showNSFW")
                : t("filters.hideNSFW")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowNSFWChange(false)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Audio only filter badge */}
          {showAudioOnly && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {filterMode === "include"
                ? t("filters.audioOnly")
                : t("filters.hideAudio")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowAudioOnlyChange(false)}
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

export default SearchBar;
