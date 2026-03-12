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
  hideNSFW: boolean;
  onHideNSFWChange: (hideNSFW: boolean) => void;
  hideAudio: boolean;
  onHideAudioChange: (hideAudio: boolean) => void;
  hideOutdated: boolean;
  onHideOutdatedChange: (hideOutdated: boolean) => void;
  filterMode: FilterMode;
  onFilterModeChange: (filterMode: FilterMode) => void;
};

const FiltersDropdown = ({
  mods,
  selectedCategories,
  onCategoriesChange,
  selectedHeroes,
  onHeroesChange,
  hideNSFW,
  onHideNSFWChange,
  hideAudio,
  onHideAudioChange,
  hideOutdated,
  onHideOutdatedChange,
  filterMode,
  onFilterModeChange,
}: FiltersDropdownProps) => {
  const { t } = useTranslation();
  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedHeroes.length > 0 ||
    hideNSFW ||
    hideAudio ||
    hideOutdated;
  const totalActiveFilters =
    selectedCategories.length +
    selectedHeroes.length +
    (hideNSFW ? 1 : 0) +
    (hideAudio ? 1 : 0) +
    (hideOutdated ? 1 : 0);

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
            <Label className='font-normal text-sm' htmlFor='hideNsfwSwitch'>
              {filterMode === "include"
                ? t("filters.showNSFWContent")
                : t("filters.hideNSFWContent")}
            </Label>
            <Switch
              checked={filterMode === "include" ? !hideNSFW : hideNSFW}
              id='hideNsfwSwitch'
              onCheckedChange={(checked) =>
                onHideNSFWChange(filterMode === "include" ? !checked : checked)
              }
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='hideAudioSwitch'>
              {filterMode === "include"
                ? t("filters.audioModsOnly")
                : t("filters.excludeAudioMods")}
            </Label>
            <Switch
              checked={filterMode === "include" ? !hideAudio : hideAudio}
              id='hideAudioSwitch'
              onCheckedChange={(checked) =>
                onHideAudioChange(filterMode === "include" ? !checked : checked)
              }
            />
          </div>
          <div className='flex items-center justify-between'>
            <Label className='font-normal text-sm' htmlFor='hideOutdatedSwitch'>
              {filterMode === "include"
                ? t("filters.showOutdated")
                : t("filters.hideOutdated")}
            </Label>
            <Switch
              checked={filterMode === "include" ? !hideOutdated : hideOutdated}
              id='hideOutdatedSwitch'
              onCheckedChange={(checked) =>
                onHideOutdatedChange(
                  filterMode === "include" ? !checked : checked,
                )
              }
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default FiltersDropdown;
