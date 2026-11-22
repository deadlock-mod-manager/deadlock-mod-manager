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
  /** `underline` heads a list it filters; `segmented` stands on its own. */
  variant?: "segmented" | "underline";
};

export const FilterTabs = <T extends string>({
  tabs,
  value,
  onValueChange,
  ariaLabel,
  variant = "segmented",
}: FilterTabsProps<T>) => (
  <ToggleGroup
    aria-label={ariaLabel}
    className={
      variant === "segmented" ? "gap-0.5 rounded-lg bg-muted p-0.5" : "gap-5"
    }
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
          "group gap-1.5 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground",
          variant === "segmented" &&
            "h-7 rounded-md px-3 text-xs data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-sm",
          variant === "underline" &&
            "relative h-10 rounded-none px-0 text-sm after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:duration-200 data-[state=on]:bg-transparent data-[state=on]:text-foreground data-[state=on]:after:bg-primary",
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
