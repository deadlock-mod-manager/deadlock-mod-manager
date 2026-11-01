import type { ReactNode } from "react";

export const Stat = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className='flex flex-col gap-[3px]'>
    <span className='font-bold text-muted-foreground/75 text-[9px] uppercase leading-[normal] tracking-[1px]'>
      {label}
    </span>
    <div className='flex items-center gap-[6px] font-semibold text-[13px] text-foreground leading-[normal]'>
      {children}
    </div>
  </div>
);
