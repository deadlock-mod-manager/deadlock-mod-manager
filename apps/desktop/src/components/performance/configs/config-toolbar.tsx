import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ArrowsDownUpIcon, XIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { FilterTabs } from "@/components/performance/filter-tabs";
import { TierIcon } from "@/components/performance/tier-icon";
import {
  CONFIG_SORTS,
  CONFIG_SOURCE_FILTERS,
  type ConfigSort,
  type ConfigSourceFilter,
} from "@/lib/performance/config-list";
import type { PerfTier } from "@/types/generated/PerfTier";

const isSort = (value: string): value is ConfigSort =>
  CONFIG_SORTS.some((sort) => sort === value);

type ConfigToolbarProps = {
  source: ConfigSourceFilter;
  onSourceChange: (source: ConfigSourceFilter) => void;
  counts: Record<ConfigSourceFilter, number>;
  /** The tier picked on the scale above, shown here so a short list explains itself. */
  tier: PerfTier | null;
  onClearTier: () => void;
  sort: ConfigSort;
  onSortChange: (sort: ConfigSort) => void;
};

export const ConfigToolbar = ({
  source,
  onSourceChange,
  counts,
  tier,
  onClearTier,
  sort,
  onSortChange,
}: ConfigToolbarProps) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-x-5 gap-y-2 border-b'>
      <FilterTabs
        ariaLabel={t("performance.configs.sourceFilter")}
        onValueChange={onSourceChange}
        tabs={CONFIG_SOURCE_FILTERS.map((filter) => ({
          value: filter,
          label: t(`performance.configs.sourceFilters.${filter}`),
          count: counts[filter],
        }))}
        value={source}
        variant='underline'
      />
      {tier && (
        <button
          aria-label={t("performance.configs.clearTier", {
            tier: t(`performance.tiers.${tier}.label`),
          })}
          className='flex h-6 items-center gap-1.5 rounded-full border bg-card pr-1.5 pl-2 text-foreground text-xs transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          onClick={onClearTier}
          type='button'>
          <TierIcon className='size-3.5' tier={tier} />
          {t(`performance.tiers.${tier}.label`)}
          <XIcon aria-hidden className='size-3 text-muted-foreground' />
        </button>
      )}
      <Select
        onValueChange={(value) => {
          if (isSort(value)) onSortChange(value);
        }}
        value={sort}>
        <SelectTrigger
          aria-label={t("performance.configs.sortLabel")}
          className='ml-auto h-8 w-auto gap-1.5 border-none bg-transparent px-0 text-foreground text-sm normal-case shadow-none [&>svg]:text-muted-foreground'>
          <ArrowsDownUpIcon
            aria-hidden
            className='size-3.5 text-muted-foreground'
          />
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
