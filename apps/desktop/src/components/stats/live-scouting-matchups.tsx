import { useTranslation } from "react-i18next";
import {
  LOSS_COLOR,
  MUTED_COLOR,
  tint,
  WIN_COLOR,
  winrateColor,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { LivePanel, Meter } from "@/components/stats/live-parts";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatPercent } from "@/lib/stats/format";
import {
  type Matchup,
  type MatchupTone,
  matchupReport,
  type WinRecord,
  winrateOf,
} from "@/lib/stats/live-lobby";
import { cn } from "@/lib/utils";

const TONE_COLORS = {
  good: WIN_COLOR,
  even: "hsl(var(--primary))",
  bad: LOSS_COLOR,
  unknown: MUTED_COLOR,
} satisfies Record<MatchupTone, string>;

const MatchupCard = ({ matchup }: { matchup: Matchup<DeadlockHero> }) => {
  const { t } = useTranslation();
  const { hero, record, winrate, note } = matchup;
  const color = TONE_COLORS[matchup.tone];
  const noteColor = note === "hardest" ? LOSS_COLOR : WIN_COLOR;
  return (
    <div
      className='flex flex-col gap-2.5 rounded-[11px] border bg-background p-[13px]'
      style={
        note === "hardest" ? { borderColor: tint(LOSS_COLOR, 25) } : undefined
      }>
      <span className='flex items-center gap-2.5'>
        <HeroAvatar
          className='h-8 w-8 rounded-lg'
          hero={hero}
          heroId={hero.id}
        />
        <span className='flex min-w-0 flex-col gap-px'>
          <span className='truncate font-semibold text-[12.5px] leading-4'>
            {t("stats.live.scouting.versus", { hero: hero.name })}
          </span>
          <span className='text-[11px] text-muted-foreground leading-[14px]'>
            {t("stats.live.labels.games", { count: record.matches })}
          </span>
        </span>
      </span>
      <span className='flex items-end justify-between'>
        <span
          className={cn(
            "font-bold font-mono tabular-nums",
            winrate === null
              ? "text-[13px] leading-4"
              : "text-xl leading-[26px]",
          )}
          style={{ color }}>
          {winrate === null
            ? t("stats.live.scouting.tooFew")
            : formatPercent(winrate, 0)}
        </span>
        {note && (
          <span
            className='font-semibold text-[10.5px] leading-[14px]'
            style={{ color: noteColor }}>
            {note === "hardest"
              ? t("stats.live.scouting.hardest")
              : t("stats.live.labels.best")}
          </span>
        )}
      </span>
      <Meter className='h-1' color={color} value={winrate ?? 0} />
    </div>
  );
};

const PooledWinrate = ({ pooled }: { pooled: WinRecord }) => {
  const { t } = useTranslation();
  const winrate = winrateOf(pooled);
  const color = winrateColor(winrate);
  return (
    <span className='flex shrink-0 items-center gap-2 text-muted-foreground text-xs leading-4'>
      {t("stats.live.scouting.acrossMatchups", { count: pooled.matches })}
      <span
        className='rounded-full px-[9px] py-[3px] font-bold font-mono text-xs leading-4 tabular-nums'
        style={{ backgroundColor: tint(color, 10), color }}>
        {formatPercent(winrate, 0)}
      </span>
    </span>
  );
};

/** How your hero has done against each hero the enemy locked. */
export const ScoutingMatchups = ({
  hero,
  enemyHeroes,
  records,
}: {
  hero: DeadlockHero;
  enemyHeroes: DeadlockHero[];
  records: Map<number, WinRecord>;
}) => {
  const { t } = useTranslation();
  const { matchups, pooled } = matchupReport(records, enemyHeroes);
  if (matchups.length === 0) return null;
  return (
    <LivePanel
      action={pooled.matches > 0 && <PooledWinrate pooled={pooled} />}
      description={t("stats.live.scouting.matchupsDescription", {
        hero: hero.name,
      })}
      title={t("stats.live.scouting.matchupsTitle", { hero: hero.name })}>
      <div className='grid grid-cols-2 gap-3 pt-4 md:grid-cols-3 xl:grid-cols-6'>
        {matchups.map((matchup) => (
          <MatchupCard key={matchup.hero.id} matchup={matchup} />
        ))}
      </div>
    </LivePanel>
  );
};
