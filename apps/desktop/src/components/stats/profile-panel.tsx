import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  AccountSwitcher,
  accountDisplayName,
  PlayerAvatar,
} from "@/components/stats/account-switcher";
import { useRankInsights } from "@/hooks/use-player-stats";
import type { SteamAccount } from "@/hooks/use-steam-accounts";
import {
  type MatchHistoryEntry,
  type PlayerRank,
  type RankAsset,
  rankLabel,
  resolveRank,
  type SteamProfile,
} from "@/lib/stats/api";
import {
  chronological,
  type HeroPerformance,
  streaks,
} from "@/lib/stats/derive";
import { badgeHistogram, badgeStanding } from "@/lib/stats/rank";

interface ProfilePanelProps {
  account: SteamAccount | null;
  accounts: SteamAccount[];
  onSelectAccount: (accountId: number) => void;
  profile: SteamProfile | null;
  rank: PlayerRank | null;
  rankAssets: RankAsset[];
  matches: MatchHistoryEntry[];
  heroes: HeroPerformance[];
}

/** Bars of the ladder are relative to the busiest tier, with a sliver for empty ones. */
const MIN_BAR = 0.04;

const Ladder = ({
  badge,
  rankAssets,
}: {
  badge: number;
  rankAssets: RankAsset[];
}) => {
  const { distribution, isPending } = useRankInsights();
  const buckets = useMemo(
    () => badgeHistogram(distribution, badge),
    [distribution, badge],
  );
  const ownColor =
    rankAssets.find((asset) => asset.tier === Math.floor(badge / 10))?.color ??
    "hsl(var(--primary))";

  if (isPending) {
    return <Skeleton className='h-[74px] w-full' />;
  }
  if (buckets.length === 0) {
    return null;
  }

  const busiest = Math.max(...buckets.map((bucket) => bucket.players));
  const first = rankAssets.find((asset) => asset.tier === buckets[0]?.tier);
  const last = rankAssets.find(
    (asset) => asset.tier === buckets[buckets.length - 1]?.tier,
  );

  return (
    <div className='flex flex-col gap-1.5'>
      <div aria-hidden className='flex h-[54px] items-end gap-[3px]'>
        {buckets.map((bucket) => (
          <div
            className='flex-1 rounded-t-[3px] rounded-b-[1px]'
            key={bucket.tier}
            style={{
              height: `${Math.max(MIN_BAR, bucket.players / busiest) * 100}%`,
              background: bucket.isOwn
                ? `linear-gradient(180deg, ${ownColor}, color-mix(in srgb, ${ownColor} 40%, transparent))`
                : "color-mix(in srgb, hsl(var(--foreground)) 9%, transparent)",
            }}
            title={rankAssets.find((asset) => asset.tier === bucket.tier)?.name}
          />
        ))}
      </div>
      <div className='flex justify-between font-mono text-[10.5px] text-muted-foreground/70'>
        <span>{first?.name}</span>
        <span>{last?.name}</span>
      </div>
    </div>
  );
};

/** Who the numbers belong to, where they stand on the ladder, and how much they play. */
export const ProfilePanel = ({
  account,
  accounts,
  onSelectAccount,
  profile,
  rank,
  rankAssets,
  matches,
  heroes,
}: ProfilePanelProps) => {
  const { t } = useTranslation();
  const name = accountDisplayName(profile, account) || t("stats.unknownPlayer");
  const badge = rank?.badge ?? 0;
  const resolved = resolveRank(badge, rankAssets);
  const { distribution } = useRankInsights(badge > 0);
  const standing = badge > 0 ? badgeStanding(distribution, badge) : null;

  const facts = useMemo(() => {
    const ordered = chronological(matches);
    const seconds = ordered.reduce(
      (sum, match) => sum + match.match_duration_s,
      0,
    );
    return {
      lastPlayed: ordered[ordered.length - 1]?.start_time ?? null,
      matches: ordered.length,
      hours: Math.round(seconds / 3600),
      bestStreak: streaks(ordered).longestWin,
    };
  }, [matches]);

  return (
    <Card className='stats-surface flex h-full flex-col gap-5 p-5 shadow-none'>
      <div className='flex items-center gap-3.5'>
        <PlayerAvatar
          className='h-[52px] w-[52px]'
          name={name}
          profile={profile}
        />
        <div className='min-w-0'>
          <div className='flex items-center gap-1'>
            <span className='truncate font-bold text-lg tracking-tight'>
              {name}
            </span>
            <AccountSwitcher
              accounts={accounts}
              onSelectAccount={onSelectAccount}
            />
          </div>
          {facts.lastPlayed !== null && (
            <span className='text-muted-foreground text-xs'>
              {t("stats.profile.lastPlayed", {
                ago: formatDistanceToNow(facts.lastPlayed * 1000, {
                  addSuffix: true,
                }),
              })}
            </span>
          )}
        </div>
      </div>

      <div className='flex flex-col gap-4 border-border/60 border-t pt-4'>
        <div className='flex items-center gap-3'>
          {badge > 0 && resolved.image ? (
            <img
              alt=''
              className='h-[50px] w-[62px] shrink-0 object-contain'
              src={resolved.image}
            />
          ) : null}
          <div className='min-w-0'>
            <div className='truncate font-bold text-lg tracking-tight'>
              {(badge > 0 && rankLabel(badge, rankAssets)) ||
                t("stats.unranked")}
            </div>
            {badge <= 0 && (
              <div className='text-muted-foreground text-xs'>
                {t("stats.profile.unrankedHint")}
              </div>
            )}
            {standing && (
              <div className='text-muted-foreground text-xs'>
                {t("stats.profile.top", {
                  percent: Math.max(
                    1,
                    Math.round((1 - standing.percentile) * 100),
                  ),
                })}
              </div>
            )}
          </div>
        </div>
        <Ladder badge={badge} rankAssets={rankAssets} />
      </div>

      <dl className='mt-auto flex flex-col gap-2 border-border/60 border-t pt-4 text-[12.5px]'>
        {(
          [
            ["matches", String(facts.matches)],
            ["hours", t("stats.profile.hoursValue", { count: facts.hours })],
            ["heroes", String(heroes.length)],
            [
              "bestStreak",
              t("stats.tiles.streakWins", { count: facts.bestStreak }),
            ],
          ] as const
        ).map(([key, value]) => (
          <div className='flex justify-between gap-3' key={key}>
            <dt className='text-muted-foreground'>
              {t(`stats.profile.facts.${key}`)}
            </dt>
            <dd className='font-mono font-semibold'>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
};
