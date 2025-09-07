import type { ModDto } from '@deadlock-mods/utils';
import { Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import CategoryFilter from './category-filter';
import HeroFilter from './hero-filter';

type FiltersDropdownProps = {
  mods: ModDto[];
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
  selectedHeroes: string[];
  onHeroesChange: (heroes: string[]) => void;
  showNSFW: boolean;
  onShowNSFWChange: (showNSFW: boolean) => void;
  hideOutdated: boolean;
  onHideOutdatedChange: (hideOutdated: boolean) => void;
  showAudioOnly: boolean;
  onShowAudioOnlyChange: (showAudioOnly: boolean) => void;
};

const FiltersDropdown = ({
  mods,
  selectedCategories,
  onCategoriesChange,
  selectedHeroes,
  onHeroesChange,
  showNSFW,
  onShowNSFWChange,
  hideOutdated,
  onHideOutdatedChange,
  showAudioOnly,
  onShowAudioOnlyChange,
}: FiltersDropdownProps) => {
  const { t } = useTranslation();
  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    showNSFW ||
    hideOutdated ||
    showAudioOnly;
  const totalActiveFilters =
    selectedCategories.length +
    selectedHeroes.length +
    (showNSFW ? 1 : 0) +
    (hideOutdated ? 1 : 0) +
    (showAudioOnly ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="relative"
          variant={hasActiveFilters ? 'default' : 'outline'}
        >
          <Filter className="mr-2 h-4 w-4" />
          {t('filters.filters')}
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
        <DropdownMenuSeparator />
        <div className="space-y-2">
          <Label className="font-medium text-sm">{t('filters.content')}</Label>
          <div className="flex items-center justify-between">
            <Label className="font-normal text-sm">{t('filters.hideOutdated')}</Label>
            <Switch
              checked={hideOutdated}
              onCheckedChange={onHideOutdatedChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-normal text-sm">{t('filters.showNSFWContent')}</Label>
            <Switch checked={showNSFW} onCheckedChange={onShowNSFWChange} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-normal text-sm">{t('filters.audioModsOnly')}</Label>
            <Switch
              checked={showAudioOnly}
              onCheckedChange={onShowAudioOnlyChange}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default FiltersDropdown;
