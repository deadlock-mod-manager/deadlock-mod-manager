import { useTranslation } from "react-i18next";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatPercent, formatWhole } from "@/lib/stats/format";
import { LOW_SAMPLE_MATCHES, type RatedLineup } from "@/lib/stats/party";
import { cn } from "@/lib/utils";

/** Bars span this winrate range; lineup winrates rarely leave it. */
const BAR_FLOOR = 0.4;
const BAR_SPAN = 0.3;

const barShare = (winrate: number) =>
  Math.min(1, Math.max(0, (winrate - BAR_FLOOR) / BAR_SPAN));

export const LINEUP_GRID =
  "grid grid-cols-[20px_minmax(220px,1.3fr)_minmax(160px,2fr)_84px] items-center gap-4";

interface LineupRowProps {
  rank: number;
  lineup: RatedLineup;
  heroesById: Map<number, DeadlockHero>;
  /** The party's expected winrate, marked on the bar. */
  expected: number | null;
}

export const LineupRow = ({
  rank,
  lineup,
  heroesById,
  expected,
}: LineupRowProps) => {
  const { t, i18n } = useTranslation();
  const { stat } = lineup;
  const color = stat && stat.winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR;
  const names = new Intl.ListFormat(i18n.language, {
    style: "short",
    type: "unit",
  }).format(
    lineup.heroIds.map(
      (heroId) => heroesById.get(heroId)?.name ?? `#${heroId}`,
    ),
  );

  // Estimates blend several trios, so they have no match count of their own.
  const matches = !stat
    ? "–"
    : stat.matches === null
      ? t("stats.party.odds.estimate")
      : formatWhole(stat.matches);

  return (
    <div
      className={cn(
        LINEUP_GRID,
        "border-foreground/[0.04] border-b px-5 py-2",
        (!stat || stat.sample < LOW_SAMPLE_MATCHES) && "opacity-55",
      )}>
      <span className='font-mono text-muted-foreground text-xs'>{rank}</span>
      <span className='flex min-w-0 items-center gap-2.5'>
        <span className='flex shrink-0 -space-x-1.5'>
          {lineup.heroIds.map((heroId) => (
            <HeroAvatar
              className='h-[30px] w-[30px] rounded-[7px] ring-2 ring-card'
              hero={heroesById.get(heroId)}
              heroId={heroId}
              key={heroId}
            />
          ))}
        </span>
        <span className='truncate font-semibold text-[13px]'>{names}</span>
      </span>
      {stat ? (
        <span className='flex items-center gap-3'>
          <span
            className='w-[52px] font-mono font-semibold text-[13px]'
            style={{ color }}>
            {formatPercent(stat.winrate)}
          </span>
          <span className='relative h-1.5 flex-1 rounded-full bg-foreground/[0.04]'>
            <span
              className='absolute inset-y-0 left-0 rounded-full'
              style={{
                width: `${barShare(stat.winrate) * 100}%`,
                background: `linear-gradient(90deg, ${tint(color, 25)}, ${color})`,
              }}
            />
            {expected !== null && (
              <span
                className='absolute -top-[3px] h-3 w-[1.5px] bg-primary/60'
                style={{ left: `${barShare(expected) * 100}%` }}
              />
            )}
          </span>
        </span>
      ) : (
        <span className='text-muted-foreground text-xs'>
          {t("stats.party.lineups.noData")}
        </span>
      )}
      <span className='font-mono text-[13px]'>{matches}</span>
    </div>
  );
};
