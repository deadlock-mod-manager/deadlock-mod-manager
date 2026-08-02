import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type {
  PlayerHeroStats,
  PlayerRank,
  RankAsset,
  SteamProfile,
} from "@/lib/stats/api";
import type { LivePlayer } from "@/lib/stats/live";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

interface LivePlayerDialogProps {
  player: LivePlayer | null;
  profile: SteamProfile | undefined;
  rank: PlayerRank | undefined;
  rankAssets: RankAsset[];
  heroStats: PlayerHeroStats[];
  heroesById: Map<number, DeadlockHero>;
  onOpenChange: (open: boolean) => void;
}

const splitBadge = (badge: number) => ({
  tier: Math.floor(badge / 10),
  subrank: badge % 10,
});

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className='flex items-baseline justify-between gap-4 text-sm'>
    <span className='text-muted-foreground'>{label}</span>
    <span className='font-medium tabular-nums'>{value}</span>
  </div>
);

/** Everything worth knowing about one player in the current lobby. */
export const LivePlayerDialog = ({
  player,
  profile,
  rank,
  rankAssets,
  heroStats,
  heroesById,
  onOpenChange,
}: LivePlayerDialogProps) => {
  const { t } = useTranslation();

  if (!player) {
    return null;
  }

  const mine = heroStats.filter(
    (entry) => entry.account_id === player.accountId,
  );
  const onCurrentHero = mine.find((entry) => entry.hero_id === player.heroId);
  const totals = mine.reduce(
    (sum, entry) => ({
      matches: sum.matches + entry.matches_played,
      wins: sum.wins + entry.wins,
      kills: sum.kills + entry.kills,
      deaths: sum.deaths + entry.deaths,
      assists: sum.assists + entry.assists,
    }),
    { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 },
  );
  const topHeroes = [...mine]
    .sort((a, b) => b.matches_played - a.matches_played)
    .slice(0, 5);

  const { tier, subrank } = splitBadge(rank?.badge ?? 0);
  const rankAsset = rankAssets.find((asset) => asset.tier === tier);
  const rankImage =
    rankAsset?.images[`large_subrank${subrank}`] ?? rankAsset?.images.large;
  const hero = heroesById.get(player.heroId);

  return (
    <Dialog onOpenChange={onOpenChange} open={player !== null}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3'>
            <Avatar className='h-10 w-10'>
              {profile?.avatarfull && (
                <AvatarImage alt='' src={profile.avatarfull} />
              )}
              <AvatarFallback>
                {profile?.personaname?.charAt(0) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <div className='truncate'>
                {profile?.personaname ?? `#${player.accountId}`}
              </div>
              <div className='flex items-center gap-1.5 font-normal text-muted-foreground text-xs'>
                {rankImage && (
                  <img
                    alt=''
                    className='h-4 w-4 object-contain'
                    src={rankImage}
                  />
                )}
                <span>{rankAsset?.name ?? t("stats.unranked")}</span>
                {subrank > 0 && <span>{subrank}</span>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className='flex items-center gap-3 rounded-lg border p-3'>
          <HeroAvatar
            className='h-10 w-10'
            hero={hero}
            heroId={player.heroId}
          />
          <div className='min-w-0 flex-1'>
            <div className='font-medium text-sm'>
              {hero?.name ?? `#${player.heroId}`}
            </div>
            <div className='text-muted-foreground text-xs'>
              {onCurrentHero
                ? t("stats.live.onHero", {
                    matches: onCurrentHero.matches_played,
                    winrate: formatPercent(
                      onCurrentHero.wins / onCurrentHero.matches_played,
                      0,
                    ),
                  })
                : t("stats.live.firstTimeHero")}
            </div>
          </div>
          <Badge variant='secondary'>
            {player.kills}/{player.deaths}/{player.assists}
          </Badge>
        </div>

        <div className='flex flex-col gap-2'>
          <Row
            label={t("stats.live.matchesTracked")}
            value={String(totals.matches)}
          />
          <Row
            label={t("stats.live.overallWinrate")}
            value={
              totals.matches > 0
                ? formatPercent(totals.wins / totals.matches, 0)
                : "-"
            }
          />
          <Row
            label={t("stats.live.overallKda")}
            value={formatDecimal(
              (totals.kills + totals.assists) / Math.max(totals.deaths, 1),
            )}
          />
          <Row
            label={t("stats.live.recentActivity")}
            value={t("stats.live.matchesLast30d", {
              count: profile?.matches_played_last_30d ?? 0,
            })}
          />
          <Row
            label={t("stats.live.netWorth")}
            value={formatCompact(player.netWorth)}
          />
        </div>

        {topHeroes.length > 0 && (
          <>
            <Separator />
            <div className='flex flex-col gap-2'>
              <span className='text-muted-foreground text-xs'>
                {t("stats.live.mostPlayed")}
              </span>
              <div className='flex flex-wrap gap-2'>
                {topHeroes.map((entry) => (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2 py-1",
                      entry.hero_id === player.heroId && "border-primary",
                    )}
                    key={entry.hero_id}>
                    <HeroAvatar
                      className='h-6 w-6'
                      hero={heroesById.get(entry.hero_id)}
                      heroId={entry.hero_id}
                    />
                    <span className='text-xs tabular-nums'>
                      {entry.matches_played} ·{" "}
                      {formatPercent(entry.wins / entry.matches_played, 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
