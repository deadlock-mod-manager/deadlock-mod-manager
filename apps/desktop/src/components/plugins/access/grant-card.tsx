import type { Icon } from "@phosphor-icons/react";
import { type ReactNode } from "react";
import { type PermissionCopy } from "@/components/plugins/plugin-permissions";
import { cn } from "@/lib/utils";

type GrantCardProps = {
  copy: PermissionCopy;
  tokens: string[];
  action: ReactNode;
  scopeIcon: Icon;
  scope: string;
  scopeMono?: boolean;
};

export const GrantCard = ({
  copy,
  tokens,
  action,
  scopeIcon: ScopeIcon,
  scope,
  scopeMono,
}: GrantCardProps) => {
  const PermissionIcon = copy.icon;
  return (
    <div className='flex w-full flex-col gap-[10px] rounded-[10px] bg-background px-[14px] py-[12px] outline outline-1 -outline-offset-1 outline-[#FFFFFF0F]'>
      <div className='flex w-full items-center gap-[10px]'>
        <span className='flex size-[28px] shrink-0 items-center justify-center rounded-[7px] bg-[#FFFFFF0A]'>
          <PermissionIcon color='#EFE0BE' size={15} />
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
          <span className='font-semibold text-[13px] text-foreground leading-[normal]'>
            {copy.title}
          </span>
          <span className='overflow-hidden text-ellipsis whitespace-pre font-mono text-[#7C756E] text-[10px] leading-[normal]'>
            {tokens.join("  ")}
          </span>
        </div>
        {action}
      </div>
      <div className='flex w-full items-center gap-[8px] rounded-[7px] bg-[#FFFFFF05] px-[10px] py-[7px]'>
        <ScopeIcon className='shrink-0' color='#A3A3A3' size={14} />
        <span
          className={cn(
            "min-w-0 truncate text-[12px] text-foreground leading-[normal]",
            scopeMono && "font-mono",
          )}>
          {scope}
        </span>
        <span className='h-px flex-1' />
        <span className='shrink-0 text-[#A3A3A3] text-[11px] leading-[normal]'>
          {copy.note}
        </span>
      </div>
    </div>
  );
};
