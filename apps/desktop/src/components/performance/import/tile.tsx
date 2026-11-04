import type { ReactNode } from "react";

export const Tile = ({
  icon,
  count,
  label,
}: {
  icon: ReactNode;
  count: number;
  label: string;
}) => (
  <div className='rounded-md border bg-card/40 px-3 py-2.5'>
    <div className='flex items-center gap-2'>
      {icon}
      <span className='font-semibold text-xl tabular-nums'>{count}</span>
    </div>
    <p className='mt-0.5 truncate text-muted-foreground text-xs' title={label}>
      {label}
    </p>
  </div>
);
