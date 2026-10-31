import { Switch } from "@deadlock-mods/ui/components/switch";
import type { Icon } from "@phosphor-icons/react";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
} from "react";
import {
  type PluginTone,
  TONE_COLOR,
} from "@/components/plugins/plugin-status";
import { cn } from "@/lib/utils";

/** A 1px stroke drawn inside the box, as the designs' outlines are. */
export const INSET_OUTLINE = "outline outline-1 -outline-offset-1";

export const StatusPill = ({
  tone,
  label,
}: {
  tone: PluginTone;
  label: string;
}) => {
  const color = TONE_COLOR[tone];
  return (
    <span
      className='flex shrink-0 items-center gap-[5px] rounded-[6px] px-[7px] py-[2px]'
      style={{
        backgroundColor: tone === "neutral" ? "#FFFFFF0F" : `${color}1F`,
      }}>
      <span
        className='size-[6px] rounded-full'
        style={{ backgroundColor: color }}
      />
      <span
        className='font-semibold text-[11px] leading-[normal]'
        style={{ color }}>
        {label}
      </span>
    </span>
  );
};

type RowButtonProps = ComponentPropsWithoutRef<"button"> & {
  icon: Icon;
  variant?: "outline" | "primary";
};

/** The compact 13px action buttons used in plugin rows and cards. */
export const RowButton = forwardRef<HTMLButtonElement, RowButtonProps>(
  (
    { icon: ButtonIcon, variant = "outline", className, children, ...props },
    ref,
  ) => (
    <button
      className={cn(
        "relative flex shrink-0 items-center gap-[8px] rounded-[8px] px-[12px] py-[6px] font-semibold text-[13px] leading-[normal] transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : cn(
              "bg-background text-foreground outline-[#262626] hover:bg-[#1E1A18]",
              INSET_OUTLINE,
            ),
        className,
      )}
      ref={ref}
      type='button'
      {...props}>
      <ButtonIcon color='currentColor' size={16} />
      {children}
    </button>
  ),
);
RowButton.displayName = "RowButton";

/** 36x20 switch: cream when on, a grey knob on #262626 when off. */
export const PluginSwitch = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Switch>) => (
  <Switch
    className={cn(
      "relative h-[20px] w-[36px] shadow-none disabled:opacity-100 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#262626] *:shadow-none *:data-[state=unchecked]:bg-[#A3A3A3]",
      className,
    )}
    {...props}
  />
);

export const SectionHeader = ({
  label,
  count,
}: {
  label: string;
  count: number;
}) => (
  <div className='flex w-full shrink-0 items-center gap-[8px] px-[2px] pt-[6px]'>
    <span className='font-bold text-[#7C756E] text-[10px] uppercase leading-[normal] tracking-[1.1px]'>
      {label}
    </span>
    <span className='font-bold font-mono text-[#7C756E] text-[10px] leading-[normal]'>
      {count}
    </span>
  </div>
);

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
        ? "bg-[#1E1A18] outline-[#EFE0BE40]"
        : "bg-card outline-[#FFFFFF0F] hover:bg-[#1E1A18]",
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
        <span className='shrink-0 font-mono text-[#A3A3A3] text-[11px] leading-[normal]'>
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
