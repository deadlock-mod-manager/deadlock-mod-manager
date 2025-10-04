import type { ModDto } from "@deadlock-mods/shared";
import { ArrowUpDown, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModCategory, SortType } from "@/lib/constants";
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
  showSafe: boolean;
  onShowSafeChange: (showSafe: boolean) => void;
  showNSFW: boolean;
  onShowNSFWChange: (showNSFW: boolean) => void;
  showOutdated: boolean;
  onShowOutdatedChange: (showOutdated: boolean) => void;
  showAudioOnly: boolean;
  onShowAudioOnlyChange: (showAudioOnly: boolean) => void;
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
  showSafe,
  onShowSafeChange,
  showNSFW,
  onShowNSFWChange,
  showOutdated,
  onShowOutdatedChange,
  showAudioOnly,
  onShowAudioOnlyChange,
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
    onShowSafeChange(true); // Reset to default (show safe content)
    onShowNSFWChange(false); // Reset to default (hide NSFW)
    onShowOutdatedChange(false); // Reset to default (hide outdated)
    onShowAudioOnlyChange(true); // Reset to default (show audio mods)
  };

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    !showSafe ||
    showNSFW ||
    showOutdated ||
    !showAudioOnly;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <div className='relative'>
            <Search className='absolute top-2.5 left-2 h-4 w-4 text-muted-foreground' />
            <Input
              className='w-80 pr-8 pl-8'
              id='search'
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("mods.searchPlaceholder")}
              value={query}
            />
            {query && (
              <button
                aria-label='Clear search'
                className='absolute top-2.5 right-2 h-4 w-4 text-muted-foreground transition-colors hover:text-foreground'
                onClick={() => setQuery("")}
                type='button'>
                <X className='h-4 w-4' />
              </button>
            )}
          </div>
          <FiltersDropdown
            mods={mods}
            onCategoriesChange={onCategoriesChange}
            onHeroesChange={onHeroesChange}
            onShowSafeChange={onShowSafeChange}
            onShowNSFWChange={onShowNSFWChange}
            onShowOutdatedChange={onShowOutdatedChange}
            onShowAudioOnlyChange={onShowAudioOnlyChange}
            selectedCategories={selectedCategories}
            selectedHeroes={selectedHeroes}
            showSafe={showSafe}
            showNSFW={showNSFW}
            showOutdated={showOutdated}
            showAudioOnly={showAudioOnly}
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
            {t("filters.activeFilters")}
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

          {/* Safe content disabled badge */}
          {!showSafe && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {t("filters.safeContentHidden")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowSafeChange(true)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* NSFW filter badge */}
          {showNSFW && (
            <Badge className='flex items-center gap-1' variant='destructive'>
              {t("filters.nsfwContentShown")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowNSFWChange(false)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Outdated content shown badge */}
          {showOutdated && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {t("filters.outdatedContentShown")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowOutdatedChange(false)}
                type='button'>
                <X className='h-3 w-3' />
              </button>
            </Badge>
          )}

          {/* Audio mods hidden badge */}
          {!showAudioOnly && (
            <Badge className='flex items-center gap-1' variant='secondary'>
              {t("filters.audioModsHidden")}
              <button
                className='ml-1 rounded-full p-0.5 hover:bg-muted'
                onClick={() => onShowAudioOnlyChange(true)}
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
