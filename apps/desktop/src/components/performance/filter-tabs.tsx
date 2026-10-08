import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { cn } from "@/lib/utils";

type FilterTab<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type FilterTabsProps<T extends string> = {
  tabs: readonly FilterTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
};

export const FilterTabs = <T extends string>({
  tabs,
  value,
  onValueChange,
  ariaLabel,
}: FilterTabsProps<T>) => (
  <ToggleGroup
    aria-label={ariaLabel}
    className='gap-0.5 rounded-lg bg-secondary/50 p-[3px]'
    onValueChange={(next) => {
      const tab = tabs.find((candidate) => candidate.value === next);
      if (tab) onValueChange(tab.value);
    }}
    size='sm'
    type='single'
    value={value}>
    {tabs.map((tab) => (
      <ToggleGroupItem
        className={cn(
          "group h-7 gap-1.5 rounded-md px-3 font-medium text-xs",
          "text-muted-foreground hover:bg-transparent hover:text-foreground",
          "data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-foreground",
        )}
        key={tab.value}
        value={tab.value}>
        {tab.label}
        {tab.count !== undefined && (
          <span
            className={cn(
              "font-medium tabular-nums text-muted-foreground/70 group-data-[state=on]:text-foreground/60",
              tab.count === 0 && "text-muted-foreground/40",
            )}>
            {tab.count}
          </span>
        )}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);
