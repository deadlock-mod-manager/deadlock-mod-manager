import { ChevronRight } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ChartCard } from "@/components/stats/chart-card";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { isWin, type PlaySession, playSessions } from "@/lib/stats/derive";
import { formatClock, formatCompact, formatDecimal } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/** Enough to fill the panel; the full history lives in the player card. */
const RECENT_COUNT = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (time: number) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const useDayLabel = () => {
  const { t, i18n } = useTranslation();
  return (unixSeconds: number) => {
    const days = Math.round(
      (startOfDay(Date.now()) - startOfDay(unixSeconds * 1000)) / DAY_MS,
    );
    if (days === 0) return t("stats.recent.today");
    if (days === 1) return t("stats.recent.yesterday");
    return new Date(unixSeconds * 1000).toLocaleDateString(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };
};

const timeOfDay = (unixSeconds: number, locale: string) =>
  new Date(unixSeconds * 1000).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

const SessionHeader = ({ session }: { session: PlaySession }) => {
  const { t, i18n } = useTranslation();
  const dayLabel = useDayLabel();
  const losses = session.matches.length - session.wins;
  const steps = session.rankSteps;

  return (
    <div className='flex items-center justify-between gap-3 px-2.5 pt-3 pb-1.5'>
      <div className='flex min-w-0 items-baseline gap-2.5'>
        <span className='font-semibold text-[12.5px]'>
          {dayLabel(session.startTime)}
        </span>
        <span className='truncate font-mono text-[11px] text-muted-foreground'>
          {t("stats.recent.span", {
            from: timeOfDay(session.startTime, i18n.language),
            to: timeOfDay(session.endTime, i18n.language),
          })}
        </span>
      </div>
      <div className='flex shrink-0 items-center gap-3 text-[11.5px]'>
        <span className='font-mono font-semibold text-foreground/85'>
          {t("stats.form.recordValue", { wins: session.wins, losses })}
        </span>
        {steps !== null && (
          <span
            className='font-medium'
            style={{
              color: steps > 0 ? WIN_COLOR : steps < 0 ? LOSS_COLOR : undefined,
            }}>
            {steps === 0
              ? t("stats.recent.rankSame")
              : t(steps > 0 ? "stats.recent.rankUp" : "stats.recent.rankDown", {
                  count: Math.abs(steps),
                })}
          </span>
        )}
      </div>
    </div>
  );
};

const Cell = ({ value, label }: { value: string; label: string }) => (
  <div className='flex w-20 shrink-0 flex-col gap-0.5'>
    <span className='font-mono font-semibold text-[13px] tabular-nums'>
      {value}
    </span>
    <span className='text-[11.5px] text-muted-foreground'>{label}</span>
  </div>
);

interface RecentMatchesProps {
  matches: MatchHistoryEntry[];
  heroesById: Map<number, DeadlockHero>;
}

/** The latest games, grouped into the sessions they were played in. */
export const RecentMatches = ({ matches, heroesById }: RecentMatchesProps) => {
  const { t, i18n } = useTranslation();

  const sessions = useMemo(() => {
    const recent = [...matches]
      .sort((a, b) => b.start_time - a.start_time)
      .slice(0, RECENT_COUNT);
    return playSessions(recent);
  }, [matches]);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.recent.description")}
      title={t("stats.charts.recentTitle")}>
      <div className='-mx-2.5 h-full min-h-0 overflow-y-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {sessions.map((session) => (
          <section key={session.startTime}>
            <SessionHeader session={session} />
            <div className='overflow-hidden rounded-lg border border-border/60 bg-background'>
              {session.matches.map((match) => {
                const won = isWin(match);
                const hero = heroesById.get(match.hero_id);
                const color = won ? WIN_COLOR : LOSS_COLOR;
                return (
                  <Link
                    aria-label={t("stats.player.openMatch", {
                      id: match.match_id,
                    })}
                    className='flex w-full cursor-pointer items-center gap-4 border-border/50 border-t px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none'
                    key={match.match_id}
                    to={`/stats/matches/${match.match_id}`}>
                    <span
                      className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-bold font-mono text-[11.5px]'
                      style={{ color, backgroundColor: tint(color, 12) }}>
                      {won
                        ? t("stats.recent.winShort")
                        : t("stats.recent.lossShort")}
                    </span>
                    <div className='flex w-44 min-w-0 shrink-0 items-center gap-2.5'>
                      <HeroAvatar
                        className={cn("h-[34px] w-[34px]", HERO_TILE_CLASS)}
                        hero={hero}
                        heroId={match.hero_id}
                      />
                      <div className='flex min-w-0 flex-col gap-0.5'>
                        <span className='truncate font-semibold text-[13px]'>
                          {hero?.name ?? `#${match.hero_id}`}
                        </span>
                        <span className='flex gap-2 text-[11.5px] text-muted-foreground'>
                          {match.match_mode === 4
                            ? t("stats.scope.ranked")
                            : t("stats.scope.unranked")}
                          <span className='font-mono text-muted-foreground'>
                            {formatClock(match.match_duration_s)}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className='flex w-24 shrink-0 flex-col gap-0.5'>
                      <span className='font-mono font-semibold text-[13px] tabular-nums'>
                        {match.player_kills}/{match.player_deaths}/
                        {match.player_assists}
                      </span>
                      <span className='text-[11.5px] text-muted-foreground'>
                        {t("stats.recent.kda", {
                          value: formatDecimal(
                            (match.player_kills + match.player_assists) /
                              Math.max(match.player_deaths, 1),
                            1,
                          ),
                        })}
                      </span>
                    </div>
                    <Cell
                      label={t("stats.recent.souls")}
                      value={formatCompact(match.net_worth)}
                    />
                    <Cell
                      label={t("stats.recent.lastHits")}
                      value={String(match.last_hits)}
                    />
                    <span className='ml-auto font-mono text-[11.5px] text-muted-foreground'>
                      {timeOfDay(match.start_time, i18n.language)}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className='h-3.5 w-3.5 shrink-0 text-muted-foreground/60'
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ChartCard>
  );
};
