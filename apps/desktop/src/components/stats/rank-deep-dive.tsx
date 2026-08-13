import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BadgeDistributionChart } from "@/components/stats/badge-distribution-chart";
import { RankChart } from "@/components/stats/rank-chart";
import { useRankInsights } from "@/hooks/use-player-stats";
import type { MatchHistoryEntry, PlayerRank, RankAsset } from "@/lib/stats/api";
import { resolveRank } from "@/lib/stats/api";
import {
  formatCompact,
  formatDateTime,
  formatPercent,
} from "@/lib/stats/format";
import {
  activeSeason,
  badgeStanding,
  PROGRESS_PER_SUBRANK,
  type RankProgress,
} from "@/lib/stats/rank";

const Figure = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className='min-w-0 px-4 py-3'>
    <dt className='truncate text-muted-foreground text-[11px]'>{label}</dt>
    <dd className='mt-0.5 truncate font-semibold text-sm tabular-nums'>
      {value}
    </dd>
    {hint && (
      <p className='truncate text-[11px] text-muted-foreground'>{hint}</p>
    )}
  </div>
);

const Panel = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className='space-y-2'>
    <div>
      <h3 className='font-semibold text-sm'>{title}</h3>
      {description && (
        <p className='text-muted-foreground text-xs'>{description}</p>
      )}
    </div>
    {children}
  </section>
);

interface RankDeepDiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rank: PlayerRank | null;
  progress: RankProgress | null;
  rankAssets: RankAsset[];
  matches: MatchHistoryEntry[];
}

/**
 * Everything the badge on the header does not say. Valve's current system tracks
 * placement games, a flat progress counter and demotion protection, and none of
 * that is visible from a tier name - so it lives one click deeper rather than
 * cluttering the dashboard.
 */
export const RankDeepDive = ({
  open,
  onOpenChange,
  rank,
  progress,
  rankAssets,
  matches,
}: RankDeepDiveProps) => {
  const { t, i18n } = useTranslation();
  // Fetched only while the dialog is mounted and open.
  const insights = useRankInsights(open);

  const badge = resolveRank(rank?.badge, rankAssets);
  const standing = useMemo(
    () => badgeStanding(insights.distribution, rank?.badge ?? 0),
    [insights.distribution, rank?.badge],
  );
  const season = useMemo(
    () => activeSeason(insights.seasons, Math.floor(Date.now() / 1000)),
    [insights.seasons],
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3'>
            {badge.image && (
              <img
                alt=''
                className='h-10 w-10 object-contain'
                src={badge.image}
              />
            )}
            <span>
              {badge.name ?? t("stats.unranked")}
              {badge.subrank > 0 && ` ${badge.subrank}`}
            </span>
          </DialogTitle>
          <DialogDescription>
            {t("stats.rank.deepDiveDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          <dl className='grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4'>
            <Figure
              hint={t("stats.rank.progressHint")}
              label={t("stats.rank.progress")}
              value={
                progress ? `${progress.points} / ${PROGRESS_PER_SUBRANK}` : "-"
              }
            />
            <Figure
              hint={
                standing
                  ? t("stats.rank.ofPlayers", {
                      players: formatCompact(standing.totalPlayers),
                    })
                  : undefined
              }
              label={t("stats.rank.standing")}
              value={
                standing
                  ? t("stats.rank.topPercent", {
                      percent: Math.max(
                        Math.round((1 - standing.percentile) * 100),
                        1,
                      ),
                    })
                  : "-"
              }
            />
            <Figure
              hint={t("stats.rank.demotionProtectionHint")}
              label={t("stats.rank.protection")}
              value={progress ? String(progress.demotionProtectionGames) : "-"}
            />
            <Figure
              hint={t("stats.rank.placementsHint")}
              label={t("stats.rank.placementsLabel")}
              value={progress ? String(progress.calibrationGames) : "-"}
            />
          </dl>

          {progress && (
            <p className='text-muted-foreground text-xs'>
              {t("stats.rank.lastRankedMatch", {
                date: formatDateTime(progress.startTime, i18n.language),
                id: progress.matchId,
              })}
              {progress.blockedLoss !== null &&
                ` · ${t("stats.rank.protectionAbsorbed", {
                  points: Math.abs(progress.blockedLoss),
                })}`}
            </p>
          )}

          <Panel
            description={t("stats.rank.distributionDescription")}
            title={t("stats.rank.distributionTitle")}>
            {insights.isPending ? (
              <Skeleton className='h-[180px] w-full rounded-lg' />
            ) : (
              <BadgeDistributionChart
                distribution={insights.distribution}
                ownBadge={rank?.badge ?? 0}
                rankAssets={rankAssets}
              />
            )}
          </Panel>

          {/* Brings its own frame - it is the same chart the Overview tab shows. */}
          <RankChart matches={matches} rankAssets={rankAssets} />

          {season && (
            <Panel
              description={
                season.isRunning
                  ? t("stats.rank.seasonEnds", {
                      date: formatDateTime(season.endsAt, i18n.language),
                    })
                  : t("stats.rank.seasonStarts", {
                      date: formatDateTime(season.startsAt, i18n.language),
                    })
              }
              title={season.season.name}>
              <dl className='grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4'>
                <Figure
                  label={t("stats.rank.seasonWins")}
                  value={String(season.season.min_wins)}
                />
                <Figure
                  label={t("stats.rank.seasonHeroWins")}
                  value={String(season.season.min_hero_wins)}
                />
                <Figure
                  label={t("stats.rank.seasonHeroUnlocks")}
                  value={String(season.season.min_hero_unlocks)}
                />
                <Figure
                  label={t("stats.rank.seasonCalibration")}
                  value={String(season.season.calibration_matches)}
                />
              </dl>
            </Panel>
          )}

          {standing && standing.atBadge > 0 && (
            <p className='text-muted-foreground text-xs'>
              {t("stats.rank.shareOnBadge", {
                share: formatPercent(
                  standing.atBadge / standing.totalPlayers,
                  1,
                ),
                players: formatCompact(standing.atBadge),
              })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
