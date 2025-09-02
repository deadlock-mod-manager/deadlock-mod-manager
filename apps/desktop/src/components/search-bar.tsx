import type { ModDto } from '@deadlock-mods/utils';
import { Search, X } from 'lucide-react';
import { ModCategory, SortType } from '@/lib/constants';
import FiltersDropdown from './filters-dropdown';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Switch } from './ui/switch';

type SearchBarProps = {
  query: string;
  setQuery: (query: string) => void;
  sortType: SortType;
  setSortType: (sortType: SortType) => void;
  hideOutdated: boolean;
  setHideOutdated: (hideOutdated: boolean) => void;
  mods: ModDto[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
};

const SearchBar = ({
  query,
  setQuery,
  sortType,
  setSortType,
  hideOutdated,
  setHideOutdated,
  mods,
  selectedCategories,
  onCategoriesChange,
  selectedHeroes,
  onHeroesChange,
}: SearchBarProps) => {
  const getHeroDisplayName = (hero: string) => {
    if (hero === 'None') {
      return 'General/Other';
    }
    return hero;
  };

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case ModCategory.GAMEPLAY_MODIFICATIONS:
        return 'Gameplay';
      case ModCategory.MODEL_REPLACEMENT:
        return 'Models';
      case ModCategory.OTHER_MISC:
        return 'Other';
      default:
        return category;
    }
  };

  const removeCategory = (categoryToRemove: string) => {
    onCategoriesChange(
      selectedCategories.filter((cat) => cat !== categoryToRemove)
    );
  };

  const removeHero = (heroToRemove: string) => {
    onHeroesChange(selectedHeroes.filter((hero) => hero !== heroToRemove));
  };

  const clearAllFilters = () => {
    onCategoriesChange([]);
    onHeroesChange([]);
  };

  const hasActiveFilters =
    selectedCategories.length > 0 || selectedHeroes.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-80 pr-8 pl-8"
              id="search"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a mod"
              value={query}
            />
            {query && (
              <button
                aria-label="Clear search"
                className="absolute top-2.5 right-2 h-4 w-4 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setQuery('')}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <FiltersDropdown
            mods={mods}
            onCategoriesChange={onCategoriesChange}
            onHeroesChange={onHeroesChange}
            selectedCategories={selectedCategories}
            selectedHeroes={selectedHeroes}
          />
        </div>
        <div className="flex items-center gap-4">
          <Select onValueChange={setSortType} value={sortType}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(SortType).map((type) => (
                  <SelectItem className="capitalize" key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="flex h-10 items-center gap-2">
            <Switch
              checked={hideOutdated}
              id="hide-outdated"
              onCheckedChange={setHideOutdated}
            />
            <Label className="text-sm" htmlFor="hide-outdated">
              Hide outdated
            </Label>
          </div>
        </div>
      </div>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Active filters:</span>

          {/* Category badges */}
          {selectedCategories.map((category) => (
            <Badge
              className="flex items-center gap-1"
              key={`category-${category}`}
              variant="secondary"
            >
              Category: {getCategoryDisplayName(category)}
              <button
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                onClick={() => removeCategory(category)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {/* Hero badges */}
          {selectedHeroes.map((hero) => (
            <Badge
              className="flex items-center gap-1"
              key={`hero-${hero}`}
              variant="secondary"
            >
              Hero: {getHeroDisplayName(hero)}
              <button
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                onClick={() => removeHero(hero)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {/* Clear all button */}
          <button
            className="text-muted-foreground text-xs underline hover:text-foreground"
            onClick={clearAllFilters}
            type="button"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
