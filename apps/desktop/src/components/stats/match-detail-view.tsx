import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { RefreshCw } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { ItemPurchaseTimeline } from "@/components/stats/item-purchase-timeline";
import { useMatchDetails } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/**
 * One number in the stat line. Frameless on purpose: ten of these used to be ten
 * bordered cells, which cost more height than the numbers themselves and turned
 * the summary into a table nobody reads across.
 */
const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className='min-w-0'>
    <dt className='truncate text-[11px] text-muted-foreground'>{label}</dt>
    <dd className='truncate font-semibold text-sm tabular-nums'>{value}</dd>
  </div>
);

interface MatchDetailViewProps {
  accountId: number;
  match: MatchHistoryEntry;
  heroesById: Map<number, DeadlockHero>;
  /** Opens the hero's own card; omitted where there is nowhere to go. */
  onSelectHero?: (heroId: number) => void;
  className?: string;
}

export const MatchDetailView = ({
  accountId,
  match,
  heroesById,
  onSelectHero,
  className,
}: MatchDetailViewProps) => {
  const { t, i18n } = useTranslation();
  const details = useMatchDetails(match.match_id, accountId);
  const hero = heroesById.get(match.hero_id);
  const won = isWin(match);
  const finalStat = details.player?.stats[details.player.stats.length - 1];
  const shots = (finalStat?.shots_hit ?? 0) + (finalStat?.shots_missed ?? 0);
  const accuracy = shots > 0 ? (finalStat?.shots_hit ?? 0) / shots : null;

  const heroName = hero?.name ?? `#${match.hero_id}`;
  const portrait = (
    <HeroAvatar className='h-12 w-12' hero={hero} heroId={match.hero_id} />
  );

  return (
    <div className={cn("flex flex-col gap-4 p-4 md:p-5", className)}>
      <header className='flex flex-wrap items-center gap-3 pr-8'>
        {onSelectHero ? (
          <button
            aria-label={t("stats.hero.openHero", { hero: heroName })}
            className='shrink-0 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            onClick={() => onSelectHero(match.hero_id)}
            type='button'>
            {portrait}
          </button>
        ) : (
          portrait
        )}
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h3 className='truncate font-semibold'>{heroName}</h3>
            <Badge
              className={
                won
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                  : undefined
              }
              variant={won ? "outline" : "destructive"}>
              {won ? t("stats.win") : t("stats.loss")}
            </Badge>
          </div>
          <p className='truncate text-muted-foreground text-xs'>
            {formatDateTime(match.start_time, i18n.language)} ·{" "}
            {formatDuration(match.match_duration_s)} · #{match.match_id}
          </p>
        </div>
        <div className='text-right'>
          <div className='font-semibold text-xl tabular-nums'>
            {match.player_kills} / {match.player_deaths} /{" "}
            {match.player_assists}
          </div>
          <div className='text-[10px] text-muted-foreground uppercase'>
            {t("stats.player.killsDeathsAssists")}
          </div>
        </div>
      </header>

      {details.isPending ? (
        <div className='space-y-4'>
          <Skeleton className='h-16 w-full rounded-lg' />
          <Skeleton className='h-48 w-full rounded-lg' />
        </div>
      ) : details.isError || !details.player || !details.match ? (
        <div
          className='flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center'
          role='status'>
          <h3 className='font-semibold text-sm'>
            {t("stats.player.detailsUnavailable")}
          </h3>
          <p className='mt-1 max-w-md text-muted-foreground text-xs'>
            {t("stats.player.detailsUnavailableDescription")}
          </p>
          <Button
            className='mt-4'
            onClick={() => details.refetch()}
            size='sm'
            type='button'
            variant='outline'>
            <RefreshCw />
            {t("stats.player.retryDetails")}
          </Button>
        </div>
      ) : (
        <>
          {/* Two rules instead of twenty cell borders - the row still reads as a
              block, at a third of the height. */}
          <dl className='grid grid-cols-3 gap-x-4 gap-y-3 border-y py-3 sm:grid-cols-5'>
            <Figure
              label={t("stats.player.kdaRatio")}
              value={formatDecimal(
                (details.player.kills + details.player.assists) /
                  Math.max(details.player.deaths, 1),
              )}
            />
            <Figure
              label={t("stats.metrics.netWorth")}
              value={formatCompact(details.player.net_worth)}
            />
            <Figure
              label={t("stats.metrics.playerDamage")}
              value={formatCompact(finalStat?.player_damage ?? 0)}
            />
            <Figure
              label={t("stats.player.damageTaken")}
              value={formatCompact(finalStat?.player_damage_taken ?? 0)}
            />
            <Figure
              label={t("stats.player.healing")}
              value={formatCompact(finalStat?.player_healing ?? 0)}
            />
            <Figure
              label={t("stats.metrics.lastHits")}
              value={formatCompact(details.player.last_hits)}
            />
            <Figure
              label={t("stats.metrics.denies")}
              value={formatCompact(details.player.denies)}
            />
            <Figure
              label={t("stats.player.accuracy")}
              value={accuracy === null ? "-" : formatPercent(accuracy, 0)}
            />
            <Figure
              label={t("stats.player.bossDamage")}
              value={formatCompact(finalStat?.boss_damage ?? 0)}
            />
            <Figure
              label={t("stats.player.level")}
              value={formatCompact(details.player.level)}
            />
          </dl>

          <ItemPurchaseTimeline
            duration={details.match.duration_s}
            itemsById={details.itemsById}
            key={match.match_id}
            player={details.player}
          />
        </>
      )}
    </div>
  );
};
