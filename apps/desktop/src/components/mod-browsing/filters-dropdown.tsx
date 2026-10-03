import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { useTranslation } from "react-i18next";
import { TimePeriod, timePeriodLabelKey } from "@/lib/constants";
import { cn, isAddedFilterActive } from "@/lib/utils";
import {
  type AddedFilter as AddedFilterValue,
  type AudioQuickFilter,
  DEFAULT_ADDED_FILTER,
  type FilterMode,
  type MapQuickFilter,
} from "@/lib/store/slices/ui";
import AddedFilter, { FILTER_ROW_CLASS } from "./added-filter";
import { FiltersTriggerButton } from "./filters-trigger-button";

type FiltersDropdownProps = {
  hideNSFW: boolean;
  onHideNSFWChange: (hideNSFW: boolean) => void;
  audioQuickFilter?: AudioQuickFilter;
  onAudioQuickFilterChange?: (value: AudioQuickFilter) => void;
  mapQuickFilter?: MapQuickFilter;
  onMapQuickFilterChange?: (value: MapQuickFilter) => void;
  hideOutdated: boolean;
  onHideOutdatedChange: (hideOutdated: boolean) => void;
  filterMode: FilterMode;
  onFilterModeChange: (filterMode: FilterMode) => void;
  hideMapFilter?: boolean;
  timePeriod?: TimePeriod;
  onTimePeriodChange?: (timePeriod: TimePeriod) => void;
  addedFilter?: AddedFilterValue;
  onAddedFilterChange?: (value: AddedFilterValue) => void;
};

const FILTER_MODES: FilterMode[] = ["include", "exclude"];

const SwitchRow = ({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <div className='flex items-center justify-between gap-3'>
    <Label className='cursor-pointer font-normal text-sm' htmlFor={id}>
      {label}
    </Label>
    <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
  </div>
);

// The secondary filters. Content type, hero, and category live in the bar
// itself; this menu holds the rarer refinements and counts only what it owns.
const FiltersDropdown = ({
  hideNSFW,
  onHideNSFWChange,
  audioQuickFilter,
  onAudioQuickFilterChange,
  mapQuickFilter,
  onMapQuickFilterChange,
  hideOutdated,
  onHideOutdatedChange,
  filterMode,
  onFilterModeChange,
  hideMapFilter,
  timePeriod,
  onTimePeriodChange,
  addedFilter,
  onAddedFilterChange,
}: FiltersDropdownProps) => {
  const { t } = useTranslation();
  const include = filterMode === "include";
  const showAudioFilter = audioQuickFilter && onAudioQuickFilterChange;
  const showMapFilter =
    !hideMapFilter && mapQuickFilter && onMapQuickFilterChange;
  const showTimePeriod = timePeriod && onTimePeriodChange;
  const showAdded = addedFilter && onAddedFilterChange;
  const totalActiveFilters = [
    hideNSFW,
    showAudioFilter && audioQuickFilter !== "off",
    showMapFilter && mapQuickFilter !== "off",
    hideOutdated,
    showAdded && isAddedFilterActive(addedFilter),
    showTimePeriod && timePeriod !== TimePeriod.ALL_TIME,
  ].filter(Boolean).length;
  const canReset = totalActiveFilters > 0 || !include;

  // Audio and map are three-way (off/only/exclude), so their switch follows
  // the match mode. NSFW and outdated are plain "hide" toggles.
  const quickFilterValue = (checked: boolean) =>
    checked ? (include ? "only" : "exclude") : "off";

  const reset = () => {
    onFilterModeChange("include");
    onHideNSFWChange(false);
    onHideOutdatedChange(false);
    onAudioQuickFilterChange?.("off");
    onMapQuickFilterChange?.("off");
    onTimePeriodChange?.(TimePeriod.ALL_TIME);
    onAddedFilterChange?.(DEFAULT_ADDED_FILTER);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FiltersTriggerButton count={totalActiveFilters} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='w-80 divide-y divide-border/60 p-0'
        // Keep the menu's typeahead and arrow keys away from the selects and
        // date pickers inside it.
        onKeyDown={(e) => e.stopPropagation()}>
        <div className='flex items-center justify-between py-2 pr-2 pl-4'>
          <span className='font-semibold text-sm'>{t("filters.filters")}</span>
          <Button
            className='h-7 px-2 text-muted-foreground text-xs hover:text-foreground'
            disabled={!canReset}
            onClick={reset}
            variant='ghost'>
            {t("filters.reset")}
          </Button>
        </div>

        <div className='space-y-2 px-4 py-3'>
          <div className={FILTER_ROW_CLASS}>
            <Label className='font-normal text-muted-foreground text-sm'>
              {t("filters.match")}
            </Label>
            <ToggleGroup
              aria-label={t("filters.match")}
              className='grid grid-cols-2 gap-0.5 rounded-md bg-muted p-0.5'
              onValueChange={(value) =>
                value && onFilterModeChange(value as FilterMode)
              }
              type='single'
              value={filterMode}>
              {FILTER_MODES.map((mode) => (
                <ToggleGroupItem
                  className={cn(
                    "h-7 rounded-[5px] px-2 text-muted-foreground text-xs",
                    "hover:bg-transparent hover:text-foreground",
                    "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                  )}
                  key={mode}
                  value={mode}>
                  {t(`filters.${mode}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {include
              ? t("filters.matchIncludeHint")
              : t("filters.matchExcludeHint")}
          </p>
        </div>

        {(showTimePeriod || showAdded) && (
          <div className='space-y-2 px-4 py-3'>
            {showTimePeriod && (
              <div className={FILTER_ROW_CLASS}>
                <Label
                  className='font-normal text-muted-foreground text-sm'
                  htmlFor='updatedPeriod'>
                  {t("filters.updated")}
                </Label>
                <Select onValueChange={onTimePeriodChange} value={timePeriod}>
                  <SelectTrigger className='h-8 w-full' id='updatedPeriod'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(TimePeriod).map((period) => (
                      <SelectItem key={period} value={period}>
                        {t(timePeriodLabelKey(period))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showAdded && (
              <AddedFilter onChange={onAddedFilterChange} value={addedFilter} />
            )}
          </div>
        )}

        <div className='space-y-3 px-4 py-3'>
          <SwitchRow
            checked={hideNSFW}
            id='hideNsfwSwitch'
            label={t("filters.hideNSFWContent")}
            onCheckedChange={onHideNSFWChange}
          />
          <SwitchRow
            checked={hideOutdated}
            id='hideOutdatedSwitch'
            label={t("filters.hideOutdated")}
            onCheckedChange={onHideOutdatedChange}
          />
          {showAudioFilter && (
            <SwitchRow
              checked={audioQuickFilter === (include ? "only" : "exclude")}
              id='hideAudioSwitch'
              label={
                include
                  ? t("filters.audioModsOnly")
                  : t("filters.excludeAudioMods")
              }
              onCheckedChange={(checked) =>
                onAudioQuickFilterChange(quickFilterValue(checked))
              }
            />
          )}
          {showMapFilter && (
            <SwitchRow
              checked={mapQuickFilter === (include ? "only" : "exclude")}
              id='hideMapSwitch'
              label={
                include
                  ? t("filters.mapsModsOnly")
                  : t("filters.excludeMapsMods")
              }
              onCheckedChange={(checked) =>
                onMapQuickFilterChange(quickFilterValue(checked))
              }
            />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default FiltersDropdown;
