import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { type Icon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SwitchStatus } from "@/components/settings/setting-row";
import { cn } from "@/lib/utils";

type FeatureToggleRowProps = {
  id: string;
  icon: Icon;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  badge?: ReactNode;
  /** What the feature still leaves applied to the game while it is off. */
  leftover?: string | null;
  onCheckedChange: (checked: boolean) => void;
};

/** One optional feature, shown with the icon of the sidebar entry it controls. */
export const FeatureToggleRow = ({
  id,
  icon: RowIcon,
  title,
  description,
  checked,
  disabled,
  badge,
  leftover,
  onCheckedChange,
}: FeatureToggleRowProps) => {
  const descriptionId = `${id}-description`;
  return (
    <div className='flex items-center gap-4 px-4 py-3.5'>
      <span
        aria-hidden='true'
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors duration-200 ease-out",
          checked
            ? "bg-primary/10 text-primary"
            : "bg-muted/60 text-muted-foreground",
        )}>
        <RowIcon size={18} weight='duotone' />
      </span>
      <div className='min-w-0 flex-1 space-y-0.5'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <Label className='font-bold text-sm' htmlFor={id}>
            {title}
          </Label>
          {badge}
        </div>
        <p className='text-muted-foreground text-sm' id={descriptionId}>
          {description}
        </p>
        {leftover && (
          <p className='flex items-start gap-1.5 pt-1 text-amber-400 text-xs'>
            <WarningCircleIcon
              aria-hidden='true'
              className='mt-px size-3.5 shrink-0'
              weight='bold'
            />
            {leftover}
          </p>
        )}
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Switch
          aria-describedby={descriptionId}
          aria-label={title}
          checked={checked}
          disabled={disabled}
          id={id}
          onCheckedChange={onCheckedChange}
        />
        <SwitchStatus checked={checked} htmlFor={id} />
      </div>
    </div>
  );
};
