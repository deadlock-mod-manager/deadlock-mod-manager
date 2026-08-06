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

const DetailMetric = ({ label, value }: { label: string; value: string }) => (
  <div className='min-w-0 border-r border-b px-3 py-2.5'>
    <dt className='truncate text-muted-foreground text-[11px]'>{label}</dt>
    <dd className='mt-0.5 truncate font-semibold text-sm tabular-nums'>
      {value}
    </dd>
  </div>
);

interface MatchDetailViewProps {
  accountId: number;
  match: MatchHistoryEntry;
  heroesById: Map<number, DeadlockHero>;
  className?: string;
}

export const MatchDetailView = ({
  accountId,
  match,
  heroesById,
  className,
}: MatchDetailViewProps) => {
  const { t, i18n } = useTranslation();
  const details = useMatchDetails(match.match_id, accountId);
  const hero = heroesById.get(match.hero_id);
  const won = isWin(match);
  const finalStat = details.player?.stats[details.player.stats.length - 1];
  const shots = (finalStat?.shots_hit ?? 0) + (finalStat?.shots_missed ?? 0);
  const accuracy = shots > 0 ? (finalStat?.shots_hit ?? 0) / shots : null;

  return (
    <div className={cn("p-4 md:p-5", className)}>
      <header className='flex flex-wrap items-center gap-3 border-b pr-8 pb-4'>
        <HeroAvatar className='h-14 w-14' hero={hero} heroId={match.hero_id} />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h3 className='truncate font-semibold'>
              {hero?.name ?? `#${match.hero_id}`}
            </h3>
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
          <p className='text-muted-foreground text-xs'>
            {formatDateTime(match.start_time, i18n.language)} ·{" "}
            {formatDuration(match.match_duration_s)} · #{match.match_id}
          </p>
        </div>
        <div className='text-right'>
          <div className='font-semibold text-xl tabular-nums'>
            {match.player_kills} / {match.player_deaths} /{" "}
            {match.player_assists}
          </div>
          <div className='text-muted-foreground text-[10px] uppercase'>
            {t("stats.player.killsDeathsAssists")}
          </div>
        </div>
      </header>

      {details.isPending ? (
        <div className='space-y-4 pt-4'>
          <Skeleton className='h-20 w-full rounded-lg' />
          <Skeleton className='h-64 w-full rounded-lg' />
        </div>
      ) : details.isError || !details.player || !details.match ? (
        <div
          className='mt-4 flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center'
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
        <div className='pt-4'>
          <dl className='grid grid-cols-2 border-t border-l sm:grid-cols-5'>
            <DetailMetric
              label={t("stats.player.kdaRatio")}
              value={formatDecimal(
                (details.player.kills + details.player.assists) /
                  Math.max(details.player.deaths, 1),
              )}
            />
            <DetailMetric
              label={t("stats.metrics.netWorth")}
              value={formatCompact(details.player.net_worth)}
            />
            <DetailMetric
              label={t("stats.metrics.playerDamage")}
              value={formatCompact(finalStat?.player_damage ?? 0)}
            />
            <DetailMetric
              label={t("stats.player.damageTaken")}
              value={formatCompact(finalStat?.player_damage_taken ?? 0)}
            />
            <DetailMetric
              label={t("stats.player.healing")}
              value={formatCompact(finalStat?.player_healing ?? 0)}
            />
            <DetailMetric
              label={t("stats.metrics.lastHits")}
              value={formatCompact(details.player.last_hits)}
            />
            <DetailMetric
              label={t("stats.metrics.denies")}
              value={formatCompact(details.player.denies)}
            />
            <DetailMetric
              label={t("stats.player.accuracy")}
              value={accuracy === null ? "-" : formatPercent(accuracy, 0)}
            />
            <DetailMetric
              label={t("stats.player.bossDamage")}
              value={formatCompact(finalStat?.boss_damage ?? 0)}
            />
            <DetailMetric
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
        </div>
      )}
    </div>
  );
};
