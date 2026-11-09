import type { ReactNode } from "react";

interface HeroSectionHeaderProps {
  title: string;
  /** Omitted for sections whose size says nothing, such as store picks. */
  count?: number;
  hint: string;
  action?: ReactNode;
}

export const HeroSectionHeader = ({
  title,
  count,
  hint,
  action,
}: HeroSectionHeaderProps) => (
  <div className='flex min-h-9 items-end justify-between gap-3'>
    <div className='min-w-0'>
      <h3 className='flex items-center gap-2 font-semibold text-sm'>
        {title}
        {count !== undefined && (
          <span className='rounded-full bg-muted px-1.5 py-0.5 font-medium font-mono text-[11px] text-muted-foreground tabular-nums leading-none'>
            {count}
          </span>
        )}
      </h3>
      <p className='mt-0.5 text-muted-foreground text-xs'>{hint}</p>
    </div>
    {action}
  </div>
);
