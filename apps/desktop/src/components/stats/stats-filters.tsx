import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { Calendar, X } from "@deadlock-mods/ui/icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  ALL_TIME_RANGE,
  isStatsMatchMode,
  type SeasonWindow,
  type StatsMatchMode,
  type StatsRange,
} from "@/lib/stats/scope";

interface StatsFiltersProps {
  mode: StatsMatchMode;
  range: StatsRange;
  seasons: SeasonWindow[];
  onModeChange: (mode: StatsMatchMode) => void;
  onRangeChange: (range: StatsRange) => void;
}

const localDay = (date: string) => new Date(`${date}T00:00:00`);

export const StatsFilters = ({
  mode,
  range,
  seasons,
  onModeChange,
  onRangeChange,
}: StatsFiltersProps) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const sinceDate = range.kind === "dates" ? range.sinceDate : "";
  const untilDate = range.kind === "dates" ? range.untilDate : "";
  const isAllTime = range.kind === "dates" && !sinceDate && !untilDate;

  const rangeLabel = () => {
    if (range.kind === "season") return range.season.name;
    if (sinceDate && untilDate)
      return dateFormat.formatRange(localDay(sinceDate), localDay(untilDate));
    if (sinceDate)
      return t("stats.scope.sinceDate", {
        date: dateFormat.format(localDay(sinceDate)),
      });
    if (untilDate)
      return t("stats.scope.untilDate", {
        date: dateFormat.format(localDay(untilDate)),
      });
    return t("stats.scope.allTime");
  };

  // A running season's scheduled end is often a placeholder, so it isn't shown.
  const seasonDates = (season: SeasonWindow) =>
    season.isRunning
      ? t("stats.scope.seasonRunning", {
          date: dateFormat.format(new Date(season.since * 1000)),
        })
      : dateFormat.formatRange(
          new Date(season.since * 1000),
          new Date((season.until - 1) * 1000),
        );

  const changeDates = (next: { sinceDate: string; untilDate: string }) =>
    onRangeChange({ kind: "dates", ...next });

  return (
    <div
      className='flex flex-wrap items-center gap-2'
      data-testid='stats-filters'>
      <ToggleGroup
        aria-label={t("stats.scope.mode")}
        className='h-9 justify-start gap-0.5 rounded-lg border bg-card p-[3px]'
        onValueChange={(value) => {
          if (isStatsMatchMode(value)) onModeChange(value);
        }}
        size='sm'
        type='single'
        value={mode}>
        {(["all", "ranked", "unranked"] satisfies StatsMatchMode[]).map(
          (value) => (
            <ToggleGroupItem
              className='h-[28px] rounded-md px-3 font-semibold text-[12.5px] text-muted-foreground hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground data-[state=on]:shadow-none'
              key={value}
              value={value}>
              {t(`stats.scope.${value}`)}
            </ToggleGroupItem>
          ),
        )}
      </ToggleGroup>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className='h-9 gap-2 rounded-lg px-3 font-semibold text-[12.5px] data-[state=open]:bg-secondary'
            data-testid='stats-range'
            size='sm'
            variant='outline'>
            <Calendar
              aria-hidden
              className='h-3.5 w-3.5 text-muted-foreground'
            />
            {rangeLabel()}
          </Button>
        </PopoverTrigger>
        <PopoverContent align='end' className='w-72 space-y-3 p-3'>
          {seasons.length > 0 && (
            <div className='space-y-1.5'>
              <Label className='text-xs' htmlFor={`${id}-season`}>
                {t("stats.scope.season")}
              </Label>
              <Select
                onValueChange={(value) => {
                  const season = seasons.find((entry) => entry.id === value);
                  if (season) onRangeChange({ kind: "season", season });
                }}
                value={range.kind === "season" ? range.season.id : ""}>
                <SelectTrigger
                  className='h-9 text-sm'
                  data-testid='stats-season'
                  id={`${id}-season`}>
                  <SelectValue placeholder={t("stats.scope.seasonPlaceholder")}>
                    {range.kind === "season" ? range.season.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((season) => (
                    <SelectItem key={season.id} value={season.id}>
                      <span>{season.name}</span>
                      <span className='ml-2 text-muted-foreground text-xs'>
                        {seasonDates(season)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='grid grid-cols-2 gap-2'>
            <div className='space-y-1.5'>
              <Label className='text-xs' htmlFor={`${id}-since`}>
                {t("stats.scope.since")}
              </Label>
              <Input
                className='h-9 text-sm'
                data-testid='stats-since'
                id={`${id}-since`}
                max={untilDate || undefined}
                min='1970-01-01'
                onChange={(event) => {
                  if (event.target.validity.valid)
                    changeDates({ sinceDate: event.target.value, untilDate });
                }}
                type='date'
                value={sinceDate}
              />
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs' htmlFor={`${id}-until`}>
                {t("stats.scope.until")}
              </Label>
              <Input
                className='h-9 text-sm'
                data-testid='stats-until'
                id={`${id}-until`}
                min={sinceDate || "1970-01-01"}
                onChange={(event) => {
                  if (event.target.validity.valid)
                    changeDates({ sinceDate, untilDate: event.target.value });
                }}
                type='date'
                value={untilDate}
              />
            </div>
          </div>
          {!isAllTime && (
            <Button
              className='h-7 w-full text-xs'
              onClick={() => onRangeChange(ALL_TIME_RANGE)}
              size='sm'
              variant='ghost'>
              {t("stats.scope.allTime")}
            </Button>
          )}
          <p className='border-border/60 border-t pt-3 text-muted-foreground text-xs leading-relaxed'>
            {t("stats.scope.hint")}
          </p>
        </PopoverContent>
      </Popover>
      {(mode !== "all" || !isAllTime) && (
        <Button
          className='h-8 gap-1.5 px-2 text-xs text-muted-foreground'
          data-testid='stats-reset'
          onClick={() => {
            onModeChange("all");
            onRangeChange(ALL_TIME_RANGE);
          }}
          size='sm'
          variant='ghost'>
          <X aria-hidden className='h-3 w-3' />
          {t("stats.scope.reset")}
        </Button>
      )}
    </div>
  );
};
