import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ArrowUpDown } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type SortSelectProps<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (sortType: T) => void;
  triggerClassName?: string;
};

export const SortSelect = <T extends string>({
  value,
  options,
  onChange,
  triggerClassName,
}: SortSelectProps<T>) => {
  const { t } = useTranslation();

  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={t("filters.sortBy")}
        className={cn("w-fit gap-1", triggerClassName)}>
        <ArrowUpDown className='mr-1.5 h-4 w-4 text-muted-foreground' />
        <SelectValue placeholder={t("filters.sortBy")} />
      </SelectTrigger>
      <SelectContent align='end'>
        <SelectGroup>
          {options.map((type) => (
            <SelectItem className='capitalize' key={type} value={type}>
              {t(`sorting.${type.replaceAll(/\s+/g, "").toLowerCase()}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
