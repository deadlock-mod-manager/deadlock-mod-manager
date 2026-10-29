import type { ReactNode } from "react";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import type { RankAsset } from "@/lib/stats/api";
import { rankLabel, resolveRank } from "@/lib/stats/api";
import { formatPercent } from "@/lib/stats/format";
import type { Grade } from "@/lib/stats/live-grades";
import type { WinRecord } from "@/lib/stats/live-lobby";
import { cn } from "@/lib/utils";

export const GRADE_STYLES = {
  D: {
    text: "text-[#f2766b]",
    pill: "bg-[#f2766b]/[0.12]",
    zone: "bg-[#f2766b]/40",
  },
  C: {
    text: "text-[#f28a4b]",
    pill: "bg-[#f28a4b]/[0.12]",
    zone: "bg-[#f28a4b]/40",
  },
  B: {
    text: "text-[#7dd3a0]",
    pill: "bg-[#7dd3a0]/[0.12]",
    zone: "bg-[#7dd3a0]/40",
  },
  A: {
    text: "text-[#e0a84e]",
    pill: "bg-[#e0a84e]/[0.12]",
    zone: "bg-[#e0a84e]/40",
  },
  S: {
    text: "text-[#60a5fa]",
    pill: "bg-[#60a5fa]/[0.12]",
    zone: "bg-[#60a5fa]/40",
  },
} satisfies Record<Grade, { text: string; pill: string; zone: string }>;

/** The game's team numbers: 2 is the Hidden King, 3 the Archmother. */
export const teamColor = (team: number) =>
  team === 3 ? "var(--team-1)" : "var(--team-0)";

export const teamName = (team: number) =>
  team === 3 ? "stats.live.teams.archmother" : "stats.live.teams.hiddenKing";

export const otherTeam = (team: number) => (team === 3 ? 2 : 3);

export const GradePill = ({
  grade,
  className,
}: {
  grade: Grade;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex h-6 w-[30px] shrink-0 items-center justify-center rounded-md font-extrabold font-mono text-[12.5px]",
      GRADE_STYLES[grade].pill,
      GRADE_STYLES[grade].text,
      className,
    )}>
    {grade}
  </span>
);

export const WinratePill = ({ record }: { record: WinRecord }) => {
  const winrate = record.wins / Math.max(record.matches, 1);
  const color = winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR;
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
  const color = rankAssets.find(
    (asset) => asset.tier === Math.floor((badge ?? 0) / 10),
  )?.color;
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", className)}
      style={color ? { color } : undefined}>
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
