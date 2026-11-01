import type { Icon } from "@phosphor-icons/react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AccessScope = ({
  icon: ScopeIcon,
  children,
  mono,
}: {
  icon: Icon;
  children: ReactNode;
  mono?: boolean;
}) => (
  <span className='flex min-w-0 items-center gap-[5px]'>
    <ScopeIcon className='shrink-0' color='#A3A3A3' size={13} />
    <span
      className={cn(
        "truncate text-[#A3A3A3] text-[12px] leading-[normal]",
        mono && "font-mono",
      )}>
      {children}
    </span>
  </span>
);
