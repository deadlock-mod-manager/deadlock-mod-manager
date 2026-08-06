import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { HeroWinrateBars } from "@/components/stats/hero-winrate-bars";
import { WinrateAreaChart } from "@/components/stats/winrate-area-chart";
import { usePlayerCard } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type RankAsset,
  resolveRank,
  type SteamProfile,
} from "@/lib/stats/api";
import { chronological, formCurve, isWin, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { heroStatsByAccount, type LivePlayer } from "@/lib/stats/live";
import { cn } from "@/lib/utils";

const FORM_WINDOW = 10;
const RECENT_MATCHES = 12;
const TOP_HEROES = 6;

interface PlayerDialogProps {
  /** Whose card to show. `null` closes the dialog. */
  accountId: number | null;
  profile: SteamProfile | undefined;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  onOpenChange: (open: boolean) => void;
  /**
   * The scoreboard row, when the card was opened from a running match. Adds the
   * hero they are on and their score in it on top of the career view.
   */
  live?: LivePlayer | null;
}

const Metric = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <Card className='flex flex-col gap-1 p-3 shadow-none'>
    <span className='text-muted-foreground text-xs'>{label}</span>
    <span className='font-semibold text-lg leading-none'>{value}</span>
    {hint && (
      <span className='truncate text-muted-foreground text-xs'>{hint}</span>
    )}
  </Card>
);

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className='flex flex-col gap-2'>
    <div>
      <h3 className='font-semibold text-sm'>{title}</h3>
      {description && (
        <p className='text-muted-foreground text-xs'>{description}</p>
      )}
    </div>
    {children}
  </section>
);

/**
 * Everything worth knowing about one player: career numbers, form, recent
 * matches and their heroes. Opened from the live scoreboard and from the Squad
 * tab; the only difference between the two is the running match, so that is the
 * one optional prop. Everything else the card fetches for itself, through the
 * same query keys the page uses - opening the same player twice is free.
 */
export const PlayerDialog = ({
  accountId,
  profile,
  heroesById,
  rankAssets,
  onOpenChange,
  live,
}: PlayerDialogProps) => {
  const { t } = useTranslation();
  const card = usePlayerCard(accountId);

  const mine = useMemo(
    () =>
      accountId === null
        ? []
        : (heroStatsByAccount(card.heroStats).get(accountId) ?? []),
    [card.heroStats, accountId],
  );

  const form = useMemo(
    () => formCurve(card.matches, FORM_WINDOW),
    [card.matches],
  );

  const recent = useMemo(
    () => chronological(card.matches).slice(-RECENT_MATCHES),
    [card.matches],
  );

  const topHeroes = useMemo(
    () =>
      [...mine]
        .sort((a, b) => b.matches_played - a.matches_played)
        .slice(0, TOP_HEROES)
        .map((entry) => ({
          heroId: entry.hero_id,
          name: heroesById.get(entry.hero_id)?.name ?? `#${entry.hero_id}`,
          winrate: (entry.wins / entry.matches_played) * 100,
          matches: entry.matches_played,
        })),
    [mine, heroesById],
  );

  const totals = useMemo(
    () =>
      mine.reduce(
        (sum, entry) => ({
          matches: sum.matches + entry.matches_played,
          wins: sum.wins + entry.wins,
          kills: sum.kills + entry.kills,
          deaths: sum.deaths + entry.deaths,
          assists: sum.assists + entry.assists,
        }),
        { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 },
      ),
    [mine],
  );

  if (accountId === null) {
    return null;
  }

  const onCurrentHero = live
    ? mine.find((entry) => entry.hero_id === live.heroId)
    : undefined;
  const recentForm = summarize(recent);
  const badge = resolveRank(card.rank?.badge, rankAssets);
  const hero = live ? heroesById.get(live.heroId) : undefined;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className='max-h-[85vh] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3'>
            <Avatar className='h-12 w-12'>
              {profile?.avatarfull && (
                <AvatarImage alt='' src={profile.avatarfull} />
              )}
              <AvatarFallback>
                {profile?.personaname?.charAt(0) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <div className='truncate'>
                {profile?.personaname ?? `#${accountId}`}
              </div>
              <div className='flex items-center gap-1.5 font-normal text-muted-foreground text-xs'>
                {badge.image && (
                  <img
                    alt=''
                    className='h-4 w-4 object-contain'
                    src={badge.image}
                  />
                )}
                <span>{badge.name ?? t("stats.unranked")}</span>
                {badge.subrank > 0 && <span>{badge.subrank}</span>}
                <span aria-hidden>·</span>
                <span className='tabular-nums'>{accountId}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {live && (
          <div className='flex items-center gap-3 rounded-lg border p-3'>
            <HeroAvatar
              className='h-11 w-11'
              hero={hero}
              heroId={live.heroId}
            />
            <div className='min-w-0 flex-1'>
              <div className='font-medium'>
                {hero?.name ?? `#${live.heroId}`}
              </div>
              <div className='text-muted-foreground text-xs'>
                {onCurrentHero
                  ? t("stats.player.onHero", {
                      matches: onCurrentHero.matches_played,
                      winrate: formatPercent(
                        onCurrentHero.wins / onCurrentHero.matches_played,
                        0,
                      ),
                    })
                  : t("stats.player.firstTimeHero")}
              </div>
            </div>
            <Badge className='shrink-0' variant='secondary'>
              {live.kills}/{live.deaths}/{live.assists}
            </Badge>
          </div>
        )}

        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          <Metric
            hint={t("stats.player.trackedMatches")}
            label={t("stats.player.overallWinrate")}
            value={
              totals.matches > 0
                ? formatPercent(totals.wins / totals.matches, 0)
                : "-"
            }
          />
          <Metric
            hint={t("stats.player.lastN", { count: RECENT_MATCHES })}
            label={t("stats.player.recentForm")}
            value={
              recent.length > 0 ? formatPercent(recentForm.winrate, 0) : "-"
            }
          />
          <Metric
            hint={`${formatDecimal(totals.kills / Math.max(totals.matches, 1), 1)} / ${formatDecimal(totals.deaths / Math.max(totals.matches, 1), 1)} / ${formatDecimal(totals.assists / Math.max(totals.matches, 1), 1)}`}
            label={t("stats.player.overallKda")}
            value={formatDecimal(
              (totals.kills + totals.assists) / Math.max(totals.deaths, 1),
            )}
          />
          {/* Net worth only means something mid-match; outside one the slot goes
              to how much history these numbers rest on. */}
          {live ? (
            <Metric
              hint={t("stats.player.netWorthHint")}
              label={t("stats.player.netWorth")}
              value={formatCompact(live.netWorth)}
            />
          ) : (
            <Metric
              hint={t("stats.player.trackedMatchesHint")}
              label={t("stats.player.trackedMatches")}
              value={String(totals.matches)}
            />
          )}
        </div>

        {card.isPending ? (
          <Skeleton className='h-[180px] w-full rounded-xl' />
        ) : (
          form.length > 1 && (
            <Section
              description={t("stats.player.formDescription", {
                window: FORM_WINDOW,
              })}
              title={t("stats.player.formTitle")}>
              <WinrateAreaChart data={form} heightPx={160} />
            </Section>
          )
        )}

        {recent.length > 0 && (
          <Section title={t("stats.player.recentMatches")}>
            <div className='flex flex-wrap gap-1.5'>
              {/* Newest first; copied because `reverse` mutates in place. */}
              {[...recent].toReversed().map((match) => (
                <Tooltip key={match.match_id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "rounded-md border-2 p-0.5",
                        isWin(match)
                          ? "border-emerald-500/60"
                          : "border-destructive/60",
                      )}>
                      <HeroAvatar
                        className='h-7 w-7'
                        hero={heroesById.get(match.hero_id)}
                        heroId={match.hero_id}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {heroesById.get(match.hero_id)?.name ?? match.hero_id} ·{" "}
                    {match.player_kills}/{match.player_deaths}/
                    {match.player_assists} · {formatCompact(match.net_worth)}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </Section>
        )}

        {topHeroes.length > 0 && (
          <Section
            description={t("stats.player.mostPlayedDescription")}
            title={t("stats.player.mostPlayed")}>
            <HeroWinrateBars heroes={topHeroes} />
          </Section>
        )}
      </DialogContent>
    </Dialog>
  );
};
