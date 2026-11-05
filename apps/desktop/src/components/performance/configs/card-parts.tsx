import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TierIcon } from "../tier-icon";
import type { PerfTier } from "@/types/generated/PerfTier";
import { useScaleFocusHandlers, useScaleLink } from "./scale-link";

export const TierLabel = ({
  tier,
  className,
}: {
  tier: PerfTier;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold text-primary text-xs uppercase tracking-wide",
        className,
      )}>
      <TierIcon tier={tier} />
      {t(`performance.tiers.${tier}.label`)}
    </span>
  );
};

const CHIP_TONES = {
  default: "border-border bg-muted/30 text-muted-foreground",
  quiet: "border-transparent text-muted-foreground/70",
  warning: "border-amber-500/25 bg-amber-500/5 text-amber-400",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
} as const;

export const Chip = ({
  children,
  icon,
  tone = "default",
  tooltip,
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof CHIP_TONES;
  tooltip?: string;
}) => {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 [&_svg]:size-3 [&_svg]:shrink-0",
        CHIP_TONES[tone],
        tooltip && "cursor-help",
      )}
      tabIndex={tooltip ? 0 : undefined}>
      {icon}
      {children}
    </span>
  );
  if (!tooltip) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent className='max-w-xs leading-relaxed'>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

/** A config card; hovering or focusing it points at its pin on the scale. */
export const ConfigCardShell = ({
  configId,
  active,
  children,
}: {
  configId: string;
  active: boolean;
  children: ReactNode;
}) => {
  const { focus } = useScaleLink();
  const handlers = useScaleFocusHandlers({ kind: "config", configId });
  const pointedAt = focus?.kind === "config" && focus.configId === configId;
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-3 rounded-lg border bg-card p-4 transition-colors duration-200 ease-out",
        active && "border-primary/70 ring-1 ring-primary/30",
        pointedAt && !active && "border-primary/40",
      )}
      {...handlers}>
      {children}
    </article>
  );
};

/** Tier and badges on the left; where the config comes from and when, on the right. */
export const CardHeader = ({
  label,
  provenance,
}: {
  label: ReactNode;
  provenance: ReactNode;
}) => (
  <div className='flex items-center justify-between gap-3'>
    <div className='flex min-w-0 items-center gap-2'>{label}</div>
    <span className='flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs [&_svg]:size-3.5 [&_svg]:shrink-0'>
      {provenance}
    </span>
  </div>
);

/** Plain counts under the blurb; chips stay for tags that describe the config. */
export const MetaRow = ({ children }: { children: ReactNode }) => (
  <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs tabular-nums [&_svg]:size-3.5 [&_svg]:shrink-0'>
    {children}
  </div>
);

export const MetaItem = ({
  icon,
  tooltip,
  children,
}: {
  icon: ReactNode;
  tooltip?: string;
  children: ReactNode;
}) => {
  const item = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        tooltip &&
          "cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      tabIndex={tooltip ? 0 : undefined}>
      {icon}
      {children}
    </span>
  );
  if (!tooltip) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent className='max-w-xs leading-relaxed'>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

/** Actions on the right; `start` holds secondary controls such as rename. */
export const CardFooter = ({
  start,
  children,
}: {
  start?: ReactNode;
  children: ReactNode;
}) => (
  <div className='mt-auto flex items-center gap-1.5 pt-1'>
    {start}
    <div className='ml-auto flex shrink-0 items-center gap-1.5'>{children}</div>
  </div>
);
