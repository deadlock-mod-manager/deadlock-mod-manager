import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { Filter } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { FilterMode } from "@/lib/store/slices/ui";
import CategoryFilter from "./category-filter";
import HeroFilter from "./hero-filter";

type FiltersDropdownProps = {
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

const FiltersDropdown = ({
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
}: FiltersDropdownProps) => {
  const { t } = useTranslation();
  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    showNSFW ||
    showAudioOnly;
  const totalActiveFilters =
    selectedCategories.length +
    selectedHeroes.length +
    (showNSFW ? 1 : 0) +
    (showAudioOnly ? 1 : 0);

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
        <div className='space-y-2'>
          <Label className='font-medium text-sm'>
            {t("filters.quickFilters")}
          </Label>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='showNsfwSwitch'>
              {filterMode === "include"
                ? t("filters.showNSFWContent")
                : t("filters.hideNSFWContent")}
            </Label>
            <Switch
              checked={showNSFW}
              id='showNsfwSwitch'
              onCheckedChange={onShowNSFWChange}
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='audioOnlySwitch'>
              {filterMode === "include"
                ? t("filters.audioModsOnly")
                : t("filters.excludeAudioMods")}
            </Label>
            <Switch
              checked={showAudioOnly}
              id='audioOnlySwitch'
              onCheckedChange={onShowAudioOnlyChange}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default FiltersDropdown;
