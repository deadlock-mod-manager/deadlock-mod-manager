import type { ReactNode } from "react";
import { tint, winrateColor } from "@/components/stats/chart-fx";
import type { RankAsset } from "@/lib/stats/api";
import { rankLabel, resolveRank } from "@/lib/stats/api";
import { formatPercent } from "@/lib/stats/format";
import type { Grade } from "@/lib/stats/live-grades";
import { type WinRecord, winrateOf } from "@/lib/stats/live-lobby";
import { cn } from "@/lib/utils";

export const GRADE_COLORS = {
  D: "var(--viz-grade-d)",
  C: "var(--viz-grade-c)",
  B: "var(--viz-grade-b)",
  A: "var(--viz-grade-a)",
  S: "var(--viz-grade-s)",
} satisfies Record<Grade, string>;

const GRADE_SIZES = {
  /** The pace card's legend. */
  xs: "h-[18px] w-[22px] rounded-md font-mono text-[10.5px]",
  sm: "h-6 w-[30px] rounded-md font-mono text-[12.5px]",
  /** The last match card's grade. */
  lg: "h-14 w-14 rounded-2xl border text-3xl",
  /** Your overall grade on the now strip. */
  xl: "h-[72px] w-[72px] rounded-2xl border text-[40px] tracking-[-1px]",
};

export const GradePill = ({
  grade,
  size = "sm",
}: {
  grade: Grade;
  size?: keyof typeof GRADE_SIZES;
}) => {
  const color = GRADE_COLORS[grade];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-extrabold",
        GRADE_SIZES[size],
      )}
      style={{
        color,
        backgroundColor: tint(color, 12),
        borderColor: tint(color, 33),
      }}>
      {grade}
    </span>
  );
};

export const WinratePill = ({ record }: { record: WinRecord }) => {
  const winrate = winrateOf(record);
  const color = winrateColor(winrate);
  return (
    <span
      className='rounded-full px-1.5 py-0.5 font-mono font-semibold text-[10.5px] tabular-nums'
      style={{ backgroundColor: tint(color, 12), color }}>
      {formatPercent(winrate, 0)}
    </span>
  );
};

export const RankTag = ({
  badge,
  rankAssets,
  className,
}: {
  badge: number | undefined;
  rankAssets: RankAsset[];
  className?: string;
}) => {
  const label = badge === undefined ? null : rankLabel(badge, rankAssets);
  if (!label) return null;
  const { image } = resolveRank(badge, rankAssets);
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-foreground text-xs",
        className,
      )}>
      {image && (
        <img alt='' className='h-4 w-4 shrink-0 object-contain' src={image} />
      )}
      <span className='truncate'>{label}</span>
    </span>
  );
};

/** Where a rank badge would be, for a player without one. */
export const UnrankedTag = ({
  label,
  className,
}: {
  label: string;
  className?: string;
}) => (
  <span
    className={cn(
      "flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs",
      className,
    )}>
    <span className='h-3.5 w-3.5 rounded-full bg-foreground/[0.08]' />
    {label}
  </span>
);

/** A small coloured label next to a player name. */
export const Tag = ({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) => (
  <span
    className='shrink-0 rounded px-1.5 py-px font-semibold text-[10.5px]'
    style={{ backgroundColor: tint(color, 14), color }}>
    {children}
  </span>
);

/** The Live tab's panel frame: the hairline, radius and padding of its design. */
export const PANEL_CLASS =
  "stats-surface rounded-[14px] border border-foreground/[0.06]";

export const LivePanel = ({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <section
    // Padding is a pixel short of the design's: its stroke sits inside the
    // frame, a CSS border adds to it.
    className={cn(PANEL_CLASS, "flex flex-col px-[21px] py-[19px]", className)}>
    <div className='flex items-center justify-between gap-4'>
      <div className='flex min-w-0 flex-col gap-[3px]'>
        <h3 className='font-medium text-[15px] leading-[19px]'>{title}</h3>
        {description && (
          <p className='text-muted-foreground text-xs leading-4'>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/**
 * Two teams' shares of one number, side by side. `left` and `right` are CSS
 * backgrounds, so either side can be a gradient.
 */
export const SplitBar = ({
  share,
  left,
  right,
  variant,
}: {
  /** The left side's share, 0 to 1. */
  share: number;
  left: string;
  right: string;
  /** `race` is the top bar's souls race; `compare` the scouting report's thin one. */
  variant: "race" | "compare";
}) => {
  const race = variant === "race";
  return (
    <span className={cn("flex", race ? "h-2 gap-[3px]" : "h-1 gap-0.5")}>
      <span
        className={race ? "rounded-l" : "rounded-full"}
        style={{ width: `${share * 100}%`, background: left }}
      />
      <span
        className={cn("flex-1", race ? "rounded-r" : "rounded-full")}
        style={{ background: right }}
      />
    </span>
  );
};

/** A filled share of a faint track. */
export const Meter = ({
  value,
  color,
  className,
}: {
  /** 0 to 1. */
  value: number;
  color: string;
  className?: string;
}) => (
  <span
    className={cn(
      "overflow-hidden rounded-full bg-foreground/[0.05]",
      className,
    )}>
    <span
      className='block h-full rounded-full'
      style={{ width: `${value * 100}%`, backgroundColor: color }}
    />
  </span>
);
