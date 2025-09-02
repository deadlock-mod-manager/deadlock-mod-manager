import type { ModDto } from '@deadlock-mods/utils';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CategoryFilter from './category-filter';
import HeroFilter from './hero-filter';

type FiltersDropdownProps = {
  mods: ModDto[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
};

const FiltersDropdown = ({
  mods,
  selectedCategories,
  onCategoriesChange,
  selectedHeroes,
  onHeroesChange,
}: FiltersDropdownProps) => {
  const hasActiveFilters =
    selectedCategories.length > 0 || selectedHeroes.length > 0;
  const totalActiveFilters = selectedCategories.length + selectedHeroes.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="relative"
          variant={hasActiveFilters ? 'default' : 'outline'}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-background px-1.5 py-0.5 text-foreground text-xs">
              {totalActiveFilters}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="space-y-4 p-4">
        <CategoryFilter
          mods={mods}
          onCategoriesChange={onCategoriesChange}
          selectedCategories={selectedCategories}
        />
        <HeroFilter
          mods={mods}
          onHeroesChange={onHeroesChange}
          selectedHeroes={selectedHeroes}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default FiltersDropdown;
