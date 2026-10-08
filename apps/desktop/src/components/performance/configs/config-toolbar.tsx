import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useTranslation } from "react-i18next";
import { FilterTabs } from "@/components/performance/filter-tabs";
import {
  CONFIG_SORTS,
  CONFIG_SOURCE_FILTERS,
  type ConfigSort,
  type ConfigSourceFilter,
} from "@/lib/performance/config-list";

const isSort = (value: string): value is ConfigSort =>
  CONFIG_SORTS.some((sort) => sort === value);

type ConfigToolbarProps = {
  source: ConfigSourceFilter;
  onSourceChange: (source: ConfigSourceFilter) => void;
  counts: Record<ConfigSourceFilter, number>;
  sort: ConfigSort;
  onSortChange: (sort: ConfigSort) => void;
};

export const ConfigToolbar = ({
  source,
  onSourceChange,
  counts,
  sort,
  onSortChange,
}: ConfigToolbarProps) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <FilterTabs
        ariaLabel={t("performance.configs.sourceFilter")}
        onValueChange={onSourceChange}
        tabs={CONFIG_SOURCE_FILTERS.map((filter) => ({
          value: filter,
          label: t(`performance.configs.sourceFilters.${filter}`),
          count: counts[filter],
        }))}
        value={source}
      />
      <Select
        onValueChange={(value) => {
          if (isSort(value)) onSortChange(value);
        }}
        value={sort}>
        <SelectTrigger
          aria-label={t("performance.configs.sortLabel")}
          className='h-8 w-auto gap-1 border-none bg-transparent text-muted-foreground text-xs normal-case shadow-none'>
          <span>{t("performance.configs.sortPrefix")}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align='end'>
          {CONFIG_SORTS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`performance.configs.sorts.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
