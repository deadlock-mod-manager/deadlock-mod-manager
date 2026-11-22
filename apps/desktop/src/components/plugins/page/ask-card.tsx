import { type ReactNode } from "react";
import { AskState } from "@/components/plugins/page/ask-state";
import { type PermissionCopy } from "@/components/plugins/plugin-permissions";
import { cn } from "@/lib/utils";

type AskCardProps = {
  copy: PermissionCopy;
  ready: boolean;
  active: boolean;
  /** The card tightens while the profile menu is open below its field. */
  tight?: boolean;
  children?: ReactNode;
};

export const AskCard = ({
  copy,
  ready,
  active,
  tight,
  children,
}: AskCardProps) => {
  const PermissionIcon = copy.icon;
  return (
    <section
      className={cn(
        "flex w-full flex-col rounded-[12px] bg-card px-4 py-[14px] ring-1 ring-inset",
        tight ? "gap-1.5" : "gap-3",
        active ? "ring-primary/25" : "ring-foreground/[0.06]",
      )}>
      <div className='flex w-full items-center gap-3'>
        <span className='flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-foreground/[0.04] text-primary'>
          <PermissionIcon size={16} />
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]'>
          <h3 className='font-semibold text-[14px] text-foreground'>
            {copy.title}
          </h3>
          <p className='text-[12px] text-muted-foreground'>{copy.detail}</p>
        </div>
        <AskState ready={ready} />
      </div>
      {children}
    </section>
  );
};
