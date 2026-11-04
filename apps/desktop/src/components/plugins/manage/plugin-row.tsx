import { type ReactNode } from "react";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { cn } from "@/lib/utils";

type PluginRowProps = {
  tile: ReactNode;
  name: string;
  version: string;
  status: ReactNode;
  accessLine: ReactNode;
  actions: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
};

/** A plugin in the Installed or Updates list. The whole row selects; its actions sit above. */
export const PluginRow = ({
  tile,
  name,
  version,
  status,
  accessLine,
  actions,
  selected,
  onSelect,
}: PluginRowProps) => (
  <div
    className={cn(
      "relative flex w-full shrink-0 items-center gap-[14px] rounded-[12px] p-[14px] transition-colors",
      INSET_OUTLINE,
      selected
        ? "bg-foreground/[0.06] outline-primary/25"
        : "bg-card outline-foreground/[0.06] hover:bg-foreground/[0.06]",
    )}>
    {onSelect && (
      <button
        aria-current={selected ? "true" : undefined}
        aria-label={name}
        className='absolute inset-0 rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring'
        onClick={onSelect}
        type='button'
      />
    )}
    {tile}
    <div className='pointer-events-none flex min-w-0 flex-1 flex-col gap-[5px]'>
      <div className='flex min-w-0 items-center gap-[8px]'>
        <span className='truncate font-semibold text-[14px] text-foreground leading-[normal]'>
          {name}
        </span>
        <span className='shrink-0 font-mono text-muted-foreground text-[11px] leading-[normal]'>
          {version}
        </span>
        {status}
      </div>
      <div className='flex min-w-0 items-center gap-[6px]'>{accessLine}</div>
    </div>
    <div className='relative flex shrink-0 items-center gap-[8px]'>
      {actions}
    </div>
  </div>
);
