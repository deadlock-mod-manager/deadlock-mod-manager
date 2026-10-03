import { Button } from "@deadlock-mods/ui/components/button";
import { Calendar } from "@deadlock-mods/ui/components/calendar";
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
import { CalendarIcon } from "@deadlock-mods/ui/icons";
import { format } from "date-fns";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AddedFilter as AddedFilterValue,
  AddedPeriod,
} from "@/lib/store/slices/ui";
import {
  ADDED_DATE_FORMAT,
  cn,
  formatAddedDate,
  parseAddedDate,
} from "@/lib/utils";

const ADDED_PERIODS: AddedPeriod[] = [
  "any",
  "today",
  "week",
  "month",
  "custom",
];

// Label column + control column, shared by the rows in the filters menu.
export const FILTER_ROW_CLASS =
  "grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2";

// Deadlock mods on GameBanana start in 2024; no need to offer earlier years.
const FIRST_MONTH = new Date(2024, 0);

type DatePickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: Date;
  max: Date;
};

const DatePicker = ({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: DatePickerProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = parseAddedDate(value);

  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <Label className='font-normal text-muted-foreground text-xs' htmlFor={id}>
        {label}
      </Label>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className={cn(
              "w-full justify-between px-3 font-normal",
              !selected && "text-muted-foreground",
            )}
            id={id}
            variant='outline'>
            <span className='truncate'>
              {selected ? formatAddedDate(value) : t("filters.pickDate")}
            </span>
            <CalendarIcon className='text-muted-foreground' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-auto p-0'>
          <Calendar
            autoFocus
            captionLayout='dropdown'
            className='bg-transparent'
            defaultMonth={selected ?? max}
            disabled={min ? [{ after: max }, { before: min }] : { after: max }}
            endMonth={max}
            mode='single'
            onSelect={(date) => {
              onChange(date ? format(date, ADDED_DATE_FORMAT) : "");
              setOpen(false);
            }}
            selected={selected}
            startMonth={FIRST_MONTH}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

type AddedFilterProps = {
  value: AddedFilterValue;
  onChange: (value: AddedFilterValue) => void;
};

const AddedFilter = ({ value, onChange }: AddedFilterProps) => {
  const { t } = useTranslation();
  const today = new Date();
  const from = parseAddedDate(value.from);
  const to = parseAddedDate(value.to);

  return (
    // Keep the dropdown menu's typeahead and arrow-key navigation away from
    // the date pickers.
    <div className={FILTER_ROW_CLASS} onKeyDown={(e) => e.stopPropagation()}>
      <Label
        className='font-normal text-muted-foreground text-sm'
        htmlFor='addedPeriod'>
        {t("filters.added")}
      </Label>
      <Select
        onValueChange={(period: AddedPeriod) => onChange({ ...value, period })}
        value={value.period}>
        <SelectTrigger className='h-8 w-full' id='addedPeriod'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ADDED_PERIODS.map((period) => (
            <SelectItem key={period} value={period}>
              {t(`filters.addedPeriod.${period}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.period === "custom" && (
        <div className='col-span-2 grid grid-cols-2 gap-2'>
          <DatePicker
            id='addedFrom'
            label={t("filters.addedFrom")}
            max={to ?? today}
            onChange={(from) => onChange({ ...value, from })}
            value={value.from}
          />
          <DatePicker
            id='addedTo'
            label={t("filters.addedTo")}
            max={today}
            min={from}
            onChange={(to) => onChange({ ...value, to })}
            value={value.to}
          />
        </div>
      )}
    </div>
  );
};

export default memo(AddedFilter);
