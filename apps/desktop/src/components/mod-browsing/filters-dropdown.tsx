import type { ModDto } from "@deadlock-mods/shared";
import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import CategoryFilter from "./category-filter";
import HeroFilter from "./hero-filter";

type FiltersDropdownProps = {
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

const FiltersDropdown = ({
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
}: FiltersDropdownProps) => {
  const { t } = useTranslation();
  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    !showSafe ||
    showNSFW ||
    showOutdated ||
    !showAudioOnly;
  const totalActiveFilters =
    selectedCategories.length +
    selectedHeroes.length +
    (!showSafe ? 1 : 0) +
    (showNSFW ? 1 : 0) +
    (showOutdated ? 1 : 0) +
    (!showAudioOnly ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className='relative'
          variant={hasActiveFilters ? "default" : "outline"}>
          <Filter className='mr-2 h-4 w-4' />
          {t("filters.filters")}
          {hasActiveFilters && (
            <span className='ml-1 rounded-full bg-background px-1.5 py-0.5 text-foreground text-xs'>
              {totalActiveFilters}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='space-y-4 p-4'>
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
            {t("filters.contentFilters")}
          </Label>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='showSafeSwitch'>
              {t("filters.safeContent")}
            </Label>
            <Switch
              checked={showSafe}
              id='showSafeSwitch'
              onCheckedChange={onShowSafeChange}
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='showNsfwSwitch'>
              {t("filters.nsfwContent")}
            </Label>
            <Switch
              checked={showNSFW}
              id='showNsfwSwitch'
              onCheckedChange={onShowNSFWChange}
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='showOutdatedSwitch'>
              {t("filters.outdatedContent")}
            </Label>
            <Switch
              checked={showOutdated}
              id='showOutdatedSwitch'
              onCheckedChange={onShowOutdatedChange}
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='audioOnlySwitch'>
              {t("filters.audioModsOnly")}
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
