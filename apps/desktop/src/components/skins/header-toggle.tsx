import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HeaderToggleProps {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accent while on: gold for the randomizer, cream for everything else. */
  tone: "gold" | "primary";
  /** Extra controls after the switch, such as a menu. */
  children?: ReactNode;
}

export const HeaderToggle = ({
  id,
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  tone,
  children,
}: HeaderToggleProps) => (
  <div
    className={cn(
      "flex h-11 min-w-0 items-center gap-3 rounded-lg border bg-card py-1 pl-3.5 transition-colors",
      children ? "pr-1" : "pr-3.5",
      checked &&
        tone === "gold" &&
        "border-secondary-foreground/40 bg-gradient-to-r from-secondary-foreground/[0.13] to-secondary-foreground/[0.04]",
      checked &&
        tone === "primary" &&
        "border-primary/40 bg-gradient-to-r from-primary/[0.1] to-primary/[0.03]",
    )}>
    <span
      className={cn(
        "flex shrink-0 [&_svg]:h-4 [&_svg]:w-4",
        !checked && "text-muted-foreground",
        checked && tone === "gold" && "text-secondary-foreground",
        checked && tone === "primary" && "text-primary",
      )}>
      {icon}
    </span>
    <div className='min-w-0'>
      <Label className='block font-semibold text-sm leading-tight' htmlFor={id}>
        {title}
      </Label>
      <p
        className={cn(
          "truncate text-xs",
          !checked && "text-muted-foreground",
          checked && tone === "gold" && "text-secondary-foreground/85",
          checked && tone === "primary" && "text-primary/80",
        )}>
        {description}
      </p>
    </div>
    <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
    {children}
  </div>
);
