import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AboutRow = ({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) => (
  <div className='flex w-full items-start gap-[12px] py-[6px]'>
    <span className='w-[96px] shrink-0 text-muted-foreground text-[12px] leading-[normal]'>
      {label}
    </span>
    <span
      className={cn(
        "min-w-0 flex-1 break-all text-[12px] text-foreground leading-[normal]",
        mono && "font-mono text-[11px]",
      )}>
      {children}
    </span>
  </div>
);
