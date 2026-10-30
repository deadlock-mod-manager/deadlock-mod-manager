import { Button } from "@deadlock-mods/ui/components/button";
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  LOSS_COLOR,
  tint,
  WIN_COLOR,
  winrateColor,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  GradePill,
  LivePanel,
  PANEL_CLASS,
  RankTag,
} from "@/components/stats/live-parts";
import { useNow } from "@/hooks/use-now";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry, RankAsset } from "@/lib/stats/api";
import { isWin, todaysSession } from "@/lib/stats/derive";
import { formatClock, formatKda, formatThousands } from "@/lib/stats/format";
import type { Grade } from "@/lib/stats/live-grades";
import { winrateOf } from "@/lib/stats/live-lobby";
import { cn } from "@/lib/utils";

const Ghost = ({ className }: { className: string }) => (
  <span className={cn("block rounded bg-foreground/[0.06]", className)} />
);

const GhostCard = ({
  rows,
  className,
}: {
  rows: number;
  className?: string;
}) => (
  <div
    className={cn(
      PANEL_CLASS,
      "flex flex-col gap-4 px-[21px] py-[19px]",
      className,
    )}>
    <div className='flex flex-col gap-2'>
      <Ghost className='h-3.5 w-40' />
      <Ghost className='h-2.5 w-64' />
    </div>
    {Array.from({ length: rows }, (_, row) => (
      <div className='flex items-center gap-4' key={row}>
        <Ghost className='h-8 w-8 rounded-lg' />
        <Ghost className='h-2.5 w-24' />
        <Ghost className='h-1.5 flex-1' />
        <Ghost className='h-2.5 w-12' />
      </div>
    ))}
  </div>
);

/**
 * A still outline of the match view under the banner: what fills in once a
 * match runs. Still, not shimmering, because nothing is loading. Cards with
 * something real to say take the place of the outline's middle row.
 */
export const LivePreview = ({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-4'>
      <div
        aria-hidden
        className={cn(
          PANEL_CLASS,
          "flex items-center gap-[22px] px-[21px] py-[15px] opacity-60",
        )}>
        <div className='flex gap-2'>
          {Array.from({ length: 6 }, (_, slot) => (
            <Ghost className='h-10 w-10 rounded-[10px]' key={slot} />
          ))}
        </div>
        <div className='flex flex-1 flex-col gap-2'>
          <div className='flex justify-between'>
            <Ghost className='h-4 w-16' />
            <Ghost className='h-4 w-20 rounded-full' />
            <Ghost className='h-4 w-16' />
          </div>
          <Ghost className='h-2' />
        </div>
        <div className='flex gap-2'>
          {Array.from({ length: 6 }, (_, slot) => (
            <Ghost className='h-10 w-10 rounded-[10px]' key={slot} />
          ))}
        </div>
      </div>
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.95fr)_minmax(0,1fr)]'>
        {left ?? <GhostCard className='opacity-60' rows={5} />}
        {right ?? <GhostCard className='opacity-60' rows={4} />}
      </div>
      <div className='relative'>
        <GhostCard className='opacity-60' rows={6} />
        <span className='pointer-events-none absolute inset-0 flex items-center justify-center font-medium text-muted-foreground/80 text-sm'>
          {t("stats.live.states.preview")}
        </span>
      </div>
    </div>
  );
};

/** Today's matches, for the time between them. */
export const LiveSessionCard = ({
  matches,
  badge,
  rankAssets,
  heroesById,
}: {
  matches: MatchHistoryEntry[];
  badge: number | undefined;
  rankAssets: RankAsset[];
  heroesById: Map<number, DeadlockHero>;
}) => {
  const { t } = useTranslation();
  const {
    matches: today,
    wins,
    best,
  } = useMemo(() => todaysSession(matches), [matches]);
  const color = winrateColor(winrateOf({ matches: today.length, wins }));

  return (
    <LivePanel
      action={
        today.length > 0 && (
          <span className='shrink-0 text-muted-foreground text-xs'>
            {t("stats.live.states.session.matches", { count: today.length })}
          </span>
        )
      }
      description={t("stats.live.states.session.description")}
      title={t("stats.live.states.session.today")}>
      {today.length === 0 ? (
        <div className='flex h-full items-center justify-center py-10 text-muted-foreground text-sm'>
          {t("stats.live.states.session.empty")}
        </div>
      ) : (
        <div className='flex flex-col gap-5 pt-2'>
          <div className='grid grid-cols-3 divide-x'>
            <div className='flex flex-col gap-1'>
              <span className='text-muted-foreground text-xs'>
                {t("stats.live.states.session.record")}
              </span>
              <span
                className='font-bold font-mono text-2xl tabular-nums'
                style={{ color }}>
                {t("stats.live.states.session.recordValue", {
                  wins,
                  losses: today.length - wins,
                })}
              </span>
            </div>
            <div className='flex flex-col gap-1 pl-5'>
              <span className='text-muted-foreground text-xs'>
                {t("stats.live.labels.rank")}
              </span>
              {badge === undefined ? (
                <span className='font-mono text-2xl'>–</span>
              ) : (
                <RankTag
                  badge={badge}
                  className='font-bold font-mono text-lg'
                  rankAssets={rankAssets}
                />
              )}
            </div>
            {best && (
              <div className='flex flex-col gap-1 pl-5'>
                <span className='text-muted-foreground text-xs'>
                  {t("stats.live.labels.best")}
                </span>
                <span className='truncate font-bold font-mono text-lg tabular-nums'>
                  {`${heroesById.get(best.hero_id)?.name ?? ""} ${formatKda(best.player_kills, best.player_deaths, best.player_assists, "/")}`}
                </span>
              </div>
            )}
          </div>
          <div className='flex flex-col gap-1.5'>
            {today.map((match) => {
              const won = isWin(match);
              const color = won ? WIN_COLOR : LOSS_COLOR;
              const hero = heroesById.get(match.hero_id);
              return (
                <Link
                  className='flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:brightness-125'
                  key={match.match_id}
                  style={{ backgroundColor: tint(color, 8) }}
                  to={`/stats/matches/${match.match_id}`}>
                  <span
                    className='w-4 font-bold font-mono text-xs'
                    style={{ color }}>
                    {won
                      ? t("stats.live.states.win")
                      : t("stats.live.states.loss")}
                  </span>
                  <HeroAvatar
                    className='h-6 w-6 rounded-md'
                    hero={hero}
                    heroId={match.hero_id}
                  />
                  <span className='flex-1 truncate text-[13px]'>
                    {hero?.name}
                  </span>
                  <span className='font-mono text-xs tabular-nums'>
                    {formatKda(
                      match.player_kills,
                      match.player_deaths,
                      match.player_assists,
                    )}
                  </span>
                  <span className='w-14 text-right font-mono text-muted-foreground text-xs tabular-nums'>
                    {formatThousands(match.net_worth)}
                  </span>
                  <span className='w-12 text-right font-mono text-muted-foreground text-xs tabular-nums'>
                    {formatClock(match.match_duration_s)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </LivePanel>
  );
};

export const LiveLastMatchCard = ({
  lastMatch,
  hero,
  grade,
}: {
  lastMatch: MatchHistoryEntry;
  hero: DeadlockHero | undefined;
  /** The overall grade the live board ended the match on, when it was watched. */
  grade: Grade | undefined;
}) => {
  const { t } = useTranslation();
  const now = useNow();
  const endedMinutes = Math.max(
    0,
    Math.round(
      (now / 1000 - lastMatch.start_time - lastMatch.match_duration_s) / 60,
    ),
  );
  const won = isWin(lastMatch);

  return (
    <LivePanel
      action={
        <span className='shrink-0 text-muted-foreground text-xs'>
          {t("stats.live.states.queued.ended", { count: endedMinutes })}
        </span>
      }
      description={
        grade
          ? t("stats.live.states.queued.gradeNote")
          : t("stats.live.states.queued.historyNote")
      }
      title={t("stats.live.states.queued.lastMatch")}>
      <div className='flex h-full flex-col justify-between gap-5 pt-2'>
        <div className='flex items-center gap-4'>
          <HeroAvatar
            className='h-14 w-14 rounded-[13px]'
            hero={hero}
            heroId={lastMatch.hero_id}
          />
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <span className='flex items-center gap-2'>
              <span
                className='font-bold text-base'
                style={{ color: won ? WIN_COLOR : LOSS_COLOR }}>
                {won
                  ? t("stats.live.states.victory")
                  : t("stats.live.states.defeat")}
              </span>
              <span className='font-mono text-muted-foreground text-xs'>
                {formatClock(lastMatch.match_duration_s)}
              </span>
            </span>
            <span className='font-bold font-mono text-xl tabular-nums'>
              {formatKda(
                lastMatch.player_kills,
                lastMatch.player_deaths,
                lastMatch.player_assists,
              )}
            </span>
            <span className='font-mono text-muted-foreground text-xs tabular-nums'>
              {t("stats.live.states.queued.souls", {
                souls: formatThousands(lastMatch.net_worth),
              })}
            </span>
          </div>
          {grade && <GradePill grade={grade} size='lg' />}
        </div>
        <Button asChild className='w-fit' size='sm' variant='outline'>
          <Link to={`/stats/matches/${lastMatch.match_id}`}>
            <ExternalLink className='h-4 w-4' />
            {t("stats.live.states.queued.open")}
          </Link>
        </Button>
      </div>
    </LivePanel>
  );
};
