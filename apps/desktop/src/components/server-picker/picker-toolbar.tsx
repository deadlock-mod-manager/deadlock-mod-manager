import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import {
  MagnifyingGlassIcon,
  PulseIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { PICKER_REGION_KEYS, type ServerPickerSort } from "@/lib/server-picker";

export interface PickerFilters {
  search: string;
  region: string;
  sort: ServerPickerSort;
}

interface PickerToolbarProps {
  filters: PickerFilters;
  regions: string[];
  probing: boolean;
  disabled: boolean;
  canProbe: boolean;
  measuredAt: number | null;
  onChange: (filters: PickerFilters) => void;
  onProbe: () => void;
  onCancelProbe: () => void;
}

export const PickerToolbar = ({
  filters,
  regions,
  probing,
  disabled,
  canProbe,
  measuredAt,
  onChange,
  onProbe,
  onCancelProbe,
}: PickerToolbarProps) => {
  const { t, i18n } = useTranslation();
  return (
    <div className='flex shrink-0 flex-wrap items-center gap-2'>
      <div className='relative min-w-40 flex-1'>
        <MagnifyingGlassIcon
          aria-hidden
          className='pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground'
        />
        <Input
          aria-label={t("serverPicker.search")}
          placeholder={t("serverPicker.search")}
          className='h-9 pl-9'
          value={filters.search}
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value })
          }
        />
      </div>
      <Select
        value={filters.region}
        onValueChange={(region) => onChange({ ...filters, region })}>
        <SelectTrigger aria-label={t("serverPicker.region")} className='w-36'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{t("serverPicker.allRegions")}</SelectItem>
          {regions.map((region) => (
            <SelectItem key={region} value={region}>
              {t(
                PICKER_REGION_KEYS.get(region) ?? "serverPicker.regions.other",
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.sort}
        onValueChange={(value) => {
          if (value === "name" || value === "latency")
            onChange({ ...filters, sort: value });
        }}>
        <SelectTrigger aria-label={t("serverPicker.sort")} className='w-32'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='name'>{t("serverPicker.sortName")}</SelectItem>
          <SelectItem value='latency' disabled={!measuredAt}>
            {t(
              measuredAt
                ? "serverPicker.sortLatency"
                : "serverPicker.sortLatencyUnmeasured",
            )}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        disabled={disabled || (!probing && !canProbe)}
        onClick={probing ? onCancelProbe : onProbe}
        variant='outline'>
        {probing ? <StopIcon aria-hidden /> : <PulseIcon aria-hidden />}
        {t(probing ? "serverPicker.stopProbe" : "serverPicker.measurePing")}
      </Button>
      <span
        aria-live='polite'
        className='min-w-24 text-[11px] tabular-nums text-muted-foreground'>
        {probing
          ? t("serverPicker.measuring")
          : measuredAt
            ? t("serverPicker.measuredShort", {
                time: new Date(measuredAt).toLocaleTimeString(i18n.language, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })
            : t("serverPicker.notMeasured")}
      </span>
    </div>
  );
};
