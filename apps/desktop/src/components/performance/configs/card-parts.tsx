import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TIERS, tierInfo, tierLevel } from "@/lib/performance/scale";
import { cn } from "@/lib/utils";
import type { PerfTier } from "@/types/generated/PerfTier";

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
      <span aria-hidden>{tierInfo(tier).emoji}</span>
      {t(`performance.tiers.${tier}.label`)}
    </span>
  );
};

export const TierMeter = ({ tier }: { tier: PerfTier }) => {
  const { t } = useTranslation();
  const level = tierLevel(tier);
  return (
    <span
      aria-label={t("performance.configs.meter", {
        level,
        total: TIERS.length,
      })}
      className='flex shrink-0 items-center gap-0.5'
      role='img'>
      {TIERS.map((info, index) => (
        <span
          className={cn(
            "h-1 w-3 rounded-full",
            index < level ? "bg-primary" : "bg-muted",
          )}
          key={info.id}
        />
      ))}
    </span>
  );
};

const CHIP_TONES = {
  default: "border-border bg-muted/30 text-muted-foreground",
  warning: "border-amber-500/25 bg-amber-500/5 text-amber-400",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
} as const;

export const Chip = ({
  children,
  icon,
  tone = "default",
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof CHIP_TONES;
  title?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 [&_svg]:size-3 [&_svg]:shrink-0",
      CHIP_TONES[tone],
    )}
    title={title}>
    {icon}
    {children}
  </span>
);

export const ConfigCardShell = ({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) => (
  <article
    className={cn(
      "flex h-full flex-col gap-3 rounded-lg border bg-card p-4",
      active && "border-primary/70 ring-1 ring-primary/30",
    )}>
    {children}
  </article>
);

export const CardFooter = ({
  source,
  children,
}: {
  source: ReactNode;
  children: ReactNode;
}) => (
  <div className='mt-auto flex items-center justify-between gap-2 pt-1'>
    <span className='flex min-w-0 items-center gap-1.5 truncate text-muted-foreground text-xs [&_svg]:size-3.5 [&_svg]:shrink-0'>
      {source}
    </span>
    <div className='flex shrink-0 items-center gap-1.5'>{children}</div>
  </div>
);
