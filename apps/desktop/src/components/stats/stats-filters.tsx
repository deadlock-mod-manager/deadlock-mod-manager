import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Calendar, ChevronDown, Info, X } from "@deadlock-mods/ui/icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { isStatsMatchMode, type StatsMatchMode } from "@/lib/stats/scope";

interface StatsFiltersProps {
  mode: StatsMatchMode;
  sinceDate: string;
  onModeChange: (mode: StatsMatchMode) => void;
  onSinceDateChange: (date: string) => void;
}

export const StatsFilters = ({
  mode,
  sinceDate,
  onModeChange,
  onSinceDateChange,
}: StatsFiltersProps) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const dateLabel = sinceDate
    ? t("stats.scope.sinceDate", {
        date: new Date(`${sinceDate}T00:00:00`).toLocaleDateString(
          i18n.language,
          {
            month: "short",
            day: "numeric",
            year: "numeric",
          },
        ),
      })
    : t("stats.scope.allTime");

  return (
    <div
      className='flex flex-wrap items-center gap-2'
      data-testid='stats-filters'>
      <ToggleGroup
        aria-label={t("stats.scope.mode")}
        className='justify-start gap-0.5 rounded-lg border border-border/50 bg-secondary/40 p-0.5'
        onValueChange={(value) => {
          if (isStatsMatchMode(value)) onModeChange(value);
        }}
        size='sm'
        type='single'
        value={mode}>
        {(["all", "ranked", "unranked"] satisfies StatsMatchMode[]).map(
          (value) => (
            <ToggleGroupItem
              className='h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground data-[state=on]:shadow-sm'
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
            className='h-8 gap-2 border-border/50 bg-transparent px-3 text-xs font-normal text-muted-foreground hover:text-foreground data-[state=open]:bg-secondary'
            size='sm'
            variant='outline'>
            <Calendar aria-hidden className='h-3.5 w-3.5' />
            {dateLabel}
            <ChevronDown aria-hidden className='h-3 w-3 opacity-60' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-64 space-y-3 p-3'>
          <Label className='text-xs' htmlFor={`${id}-since`}>
            {t("stats.scope.since")}
          </Label>
          <Input
            className='h-9 text-sm'
            id={`${id}-since`}
            min='1970-01-01'
            onChange={(event) => {
              if (event.target.validity.valid)
                onSinceDateChange(event.target.value);
            }}
            type='date'
            value={sinceDate}
          />
          {sinceDate && (
            <Button
              className='h-7 w-full text-xs'
              onClick={() => onSinceDateChange("")}
              size='sm'
              variant='ghost'>
              {t("stats.scope.allTime")}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {(mode !== "all" || sinceDate !== "") && (
        <Button
          className='h-8 gap-1.5 px-2 text-xs text-muted-foreground'
          onClick={() => {
            onModeChange("all");
            onSinceDateChange("");
          }}
          size='sm'
          variant='ghost'>
          <X aria-hidden className='h-3 w-3' />
          {t("stats.scope.reset")}
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("stats.scope.about")}
            className='h-7 w-7 text-muted-foreground/60 hover:text-foreground'
            size='icon'
            variant='ghost'>
            <Info aria-hidden className='h-3.5 w-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className='max-w-80 text-pretty leading-relaxed'
          side='bottom'>
          {t("stats.scope.hint")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
