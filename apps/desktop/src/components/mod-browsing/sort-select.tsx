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
import { SortType } from "@/lib/constants";

type SortSelectProps = {
  value: SortType;
  onChange: (sortType: SortType) => void;
};

export const SortSelect = ({ value, onChange }: SortSelectProps) => {
  const { t } = useTranslation();

  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={t("filters.sortBy")} className='w-fit gap-1'>
        <ArrowUpDown className='mr-1.5 h-4 w-4 text-muted-foreground' />
        <SelectValue placeholder={t("filters.sortBy")} />
      </SelectTrigger>
      <SelectContent align='end'>
        <SelectGroup>
          {Object.values(SortType).map((type) => (
            <SelectItem className='capitalize' key={type} value={type}>
              {t(`sorting.${type.replaceAll(/\s+/g, "").toLowerCase()}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
