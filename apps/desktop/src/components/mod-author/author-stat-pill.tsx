import type { ReactNode } from "react";

export const AuthorStatPill = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <span className='inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2.5 py-1 text-xs shadow-sm'>
    <span className='text-muted-foreground'>{icon}</span>
    <span className='font-semibold tabular-nums text-foreground'>{value}</span>
    <span className='text-muted-foreground'>{label}</span>
  </span>
);
