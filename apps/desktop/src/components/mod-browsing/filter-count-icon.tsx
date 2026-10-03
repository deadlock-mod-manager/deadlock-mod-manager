import { Filter } from "@deadlock-mods/ui/icons";

/**
 * The funnel plus an active-filter count, for an `iconExpand` trigger. The count
 * rides along with the icon because iconExpand clips children while collapsed;
 * the trigger needs `relative` for the badge to anchor to it.
 */
export const FilterCountIcon = ({ count }: { count: number }) => (
  <>
    <Filter className='h-4 w-4' />
    {count > 0 && (
      <span className='-top-1.5 -right-1.5 pointer-events-none absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 font-medium text-[10px] text-foreground tabular-nums ring-1 ring-border'>
        {count}
      </span>
    )}
  </>
);
