import { Button } from "@deadlock-mods/ui/components/button";
import {
  Download,
  ExternalLink,
  Eye,
  Flag,
  Gamepad2,
  Hammer,
  Loader2,
  Moon,
  Radio,
  Search,
  ToggleLeft,
  Trophy,
} from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  GRADE_STYLES,
  LivePanel,
  PANEL_CLASS,
  RankTag,
} from "@/components/stats/live-parts";
import { useLaunch } from "@/hooks/use-launch";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry, RankAsset } from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";
import { formatClock, formatThousands } from "@/lib/stats/format";
import type { Grade } from "@/lib/stats/live-grades";
import { cn } from "@/lib/utils";

const IconTile = ({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) => (
  <span
    className='flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border'
    style={{
      color,
      backgroundColor: tint(color, 10),
      borderColor: tint(color, 22),
    }}>
    {children}
  </span>
);

/**
 * Where the state of the tab is said, in the slot your hero takes once a match
 * runs, so nothing moves when one starts.
 */
export const LiveBanner = ({
  icon,
  color,
  title,
  description,
  aside,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  description: string;
  aside?: ReactNode;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      PANEL_CLASS,
      "flex flex-wrap items-center gap-x-8 gap-y-4 px-[23px] py-[19px]",
    )}
    style={{
      backgroundImage: `linear-gradient(90deg, ${tint(color, 8)}, transparent 45%)`,
    }}>
    <div className='flex min-w-0 flex-1 items-center gap-4'>
      <IconTile color={color}>{icon}</IconTile>
      <div className='flex min-w-0 flex-col gap-1'>
        <span className='font-bold text-xl tracking-tight'>{title}</span>
        <span className='max-w-xl text-[13px] text-muted-foreground leading-relaxed'>
          {description}
        </span>
        {children}
      </div>
    </div>
    {aside && <div className='flex items-center gap-2'>{aside}</div>}
  </div>
);

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

export const LiveInstallBanner = ({
  inLibrary,
  isInstalling,
  onInstall,
}: {
  inLibrary: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}) => {
  const { t } = useTranslation();
  const [explained, setExplained] = useState(false);
  const points = [
    { Icon: Eye, label: t("stats.live.states.install.readsTopBar") },
    { Icon: Hammer, label: t("stats.live.states.install.builtFromGame") },
    { Icon: ToggleLeft, label: t("stats.live.states.install.turnOff") },
  ];
  return (
    <LiveBanner
      aside={
        <>
          <Button disabled={isInstalling} onClick={onInstall}>
            {isInstalling ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Download className='h-4 w-4' />
            )}
            {isInstalling
              ? t("stats.live.bridge.installing")
              : inLibrary
                ? t("stats.live.bridge.enable")
                : t("stats.live.states.install.action")}
          </Button>
          <Button
            onClick={() => setExplained((open) => !open)}
            variant='outline'>
            {t("stats.live.states.install.howItWorks")}
          </Button>
        </>
      }
      color='hsl(var(--primary))'
      description={
        inLibrary
          ? t("stats.live.bridge.disabledDescription")
          : t("stats.live.states.install.description")
      }
      icon={<Radio className='h-6 w-6' />}
      title={
        inLibrary
          ? t("stats.live.bridge.disabledTitle")
          : t("stats.live.states.install.title")
      }>
      <div className='flex flex-wrap gap-x-5 gap-y-1.5 pt-1.5'>
        {points.map(({ Icon, label }) => (
          <span className='flex items-center gap-2 text-[12.5px]' key={label}>
            <Icon
              className='h-3.5 w-3.5 shrink-0'
              style={{ color: WIN_COLOR }}
            />
            {label}
          </span>
        ))}
      </div>
      {explained && (
        <span className='mt-2 max-w-xl rounded-lg border bg-background px-3 py-2.5 text-muted-foreground text-xs leading-relaxed'>
          {t("stats.live.bridge.modDescription")}
        </span>
      )}
    </LiveBanner>
  );
};

export const LiveClosedBanner = () => {
  const { t } = useTranslation();
  const { launch } = useLaunch();
  const start = useMutation({ mutationFn: () => launch() });
  return (
    <LiveBanner
      aside={
        <Button disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <Gamepad2 className='h-4 w-4' />
          )}
          {t("stats.live.states.closed.launch")}
        </Button>
      }
      color='hsl(var(--muted-foreground))'
      description={t("stats.live.states.closed.description")}
      icon={<Moon className='h-6 w-6' />}
      title={t("stats.live.notRunningTitle")}
    />
  );
};

/** Ticks once a second while mounted; the queue timer is the only reader. */
const useNow = () => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const SKY = "#60a5fa";

export const LiveQueuedBanner = ({ since }: { since: number | null }) => {
  const { t } = useTranslation();
  const now = useNow();
  return (
    <LiveBanner
      aside={
        since !== null && (
          <span className='font-bold font-mono text-[32px] text-sky-400 tabular-nums'>
            {formatClock(Math.max(0, (now - since) / 1000))}
          </span>
        )
      }
      color={SKY}
      description={t("stats.live.states.queued.description")}
      icon={<Search className='h-6 w-6' />}
      title={t("stats.live.queuedTitle")}
    />
  );
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() / 1000;
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
  const today = useMemo(() => {
    const since = startOfToday();
    return matches
      .filter((match) => match.start_time >= since)
      .sort((a, b) => a.start_time - b.start_time);
  }, [matches]);
  const wins = today.filter(isWin).length;
  const best = [...today].sort(
    (a, b) =>
      b.player_kills +
      b.player_assists -
      b.player_deaths -
      (a.player_kills + a.player_assists - a.player_deaths),
  )[0];

  return (
    <LivePanel
      action={
        today.length > 0 && (
          <span className='shrink-0 text-muted-foreground text-xs'>
            {t("stats.live.states.closed.matches", { count: today.length })}
          </span>
        )
      }
      description={t("stats.live.states.session.description")}
      title={t("stats.live.states.closed.today")}>
      {today.length === 0 ? (
        <div className='flex h-full items-center justify-center py-10 text-muted-foreground text-sm'>
          {t("stats.live.states.session.empty")}
        </div>
      ) : (
        <div className='flex flex-col gap-5 pt-2'>
          <div className='grid grid-cols-3 divide-x'>
            <div className='flex flex-col gap-1'>
              <span className='text-muted-foreground text-xs'>
                {t("stats.live.states.closed.record")}
              </span>
              <span
                className='font-bold font-mono text-2xl tabular-nums'
                style={{
                  color: wins * 2 >= today.length ? WIN_COLOR : LOSS_COLOR,
                }}>
                {`${wins} – ${today.length - wins}`}
              </span>
            </div>
            <div className='flex flex-col gap-1 pl-5'>
              <span className='text-muted-foreground text-xs'>
                {t("stats.live.board.rank")}
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
                  {t("stats.live.states.closed.best")}
                </span>
                <span className='truncate font-bold font-mono text-lg tabular-nums'>
                  {`${heroesById.get(best.hero_id)?.name ?? ""} ${best.player_kills}/${best.player_deaths}/${best.player_assists}`}
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
                    {`${match.player_kills} / ${match.player_deaths} / ${match.player_assists}`}
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
              {`${lastMatch.player_kills} / ${lastMatch.player_deaths} / ${lastMatch.player_assists}`}
            </span>
            <span className='font-mono text-muted-foreground text-xs tabular-nums'>
              {t("stats.live.states.queued.souls", {
                souls: formatThousands(lastMatch.net_worth),
              })}
            </span>
          </div>
          {grade && (
            <span
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-2xl border font-extrabold text-3xl",
                GRADE_STYLES[grade].pill,
                GRADE_STYLES[grade].text,
              )}
              style={{
                borderColor:
                  "color-mix(in srgb, currentcolor 35%, transparent)",
              }}>
              {grade}
            </span>
          )}
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

/** The finished match's banner: its result, and a way into the full match once the API has it. */
export const LiveMatchOverBanner = ({
  matchId,
  inHistory,
  clock,
  result,
}: {
  matchId: string | null;
  /** The API has the match, so its detail page can open. */
  inHistory: boolean;
  clock: string | null;
  result: "win" | "loss" | null;
}) => {
  const { t } = useTranslation();
  const color =
    result === "win"
      ? WIN_COLOR
      : result === "loss"
        ? LOSS_COLOR
        : "hsl(var(--muted-foreground))";
  const title =
    result === "win"
      ? t("stats.live.states.victory")
      : result === "loss"
        ? t("stats.live.states.defeat")
        : t("stats.live.states.over.ended");

  return (
    <LiveBanner
      aside={
        matchId &&
        (inHistory ? (
          <Button asChild variant='outline'>
            <Link to={`/stats/matches/${matchId}`}>
              <ExternalLink className='h-4 w-4' />
              {t("stats.live.states.over.details")}
            </Link>
          </Button>
        ) : (
          <>
            <span className='text-muted-foreground text-xs'>
              {t("stats.live.states.over.detailsSoon")}
            </span>
            <Button disabled variant='outline'>
              <ExternalLink className='h-4 w-4' />
              {t("stats.live.states.over.details")}
            </Button>
          </>
        ))
      }
      color={color}
      description={t("stats.live.states.over.description", {
        clock: clock ?? "",
      })}
      icon={
        result === "win" ? (
          <Trophy className='h-6 w-6' />
        ) : (
          <Flag className='h-6 w-6' />
        )
      }
      title={title}
    />
  );
};
