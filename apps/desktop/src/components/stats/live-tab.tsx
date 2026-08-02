import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  FileWarning,
  Loader2,
  Radio,
  TriangleAlert,
} from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { LiveLeaderboard } from "@/components/stats/live-leaderboard";
import { LiveMatchCharts } from "@/components/stats/live-match-chart";
import { LivePlayerDialog } from "@/components/stats/live-player-dialog";
import { useLiveMatch } from "@/hooks/use-live-match";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { RankAsset } from "@/lib/stats/api";
import { formatCompact, formatPercent } from "@/lib/stats/format";
import type { LivePlayer } from "@/lib/stats/live";
import { cn } from "@/lib/utils";

/** The game numbers the teams 2 and 3. */
const SAPPHIRE = 2;

interface LiveTabProps {
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  /** Highlights the row belonging to the account the page is showing. */
  ownAccountId: number | null;
}

export const LiveTab = ({
  heroesById,
  rankAssets,
  ownAccountId,
}: LiveTabProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<LivePlayer | null>(null);
  const live = useLiveMatch(true);

  const { profiles, ranks, heroStats } = live;

  // Everything here is parsed out of console.log, which the game only writes
  // with -condebug. Without it the tab can never find anything, so it says so
  // instead of spinning forever.
  if (!live.consoleLogAvailable) {
    return (
      <Empty className='py-16'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <FileWarning className='h-16 w-16' />
          </EmptyMedia>
          <EmptyTitle>{t("stats.live.condebugTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("stats.live.condebugDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() =>
              navigate("/settings", { state: { activeTab: "launch-options" } })
            }>
            {t("stats.live.openSettings")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // In matchmaking: the lobby lands in the log within a minute, so this is a
  // waiting state rather than an empty one.
  if (!live.match && live.queued) {
    return (
      <Empty className='py-16'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <span className='relative flex h-16 w-16 items-center justify-center'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20' />
              <Radio className='relative h-10 w-10 text-primary' />
            </span>
          </EmptyMedia>
          <EmptyTitle>{t("stats.live.queuedTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("stats.live.queuedDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!live.match) {
    return (
      <Empty className='py-16'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <Radio className='h-16 w-16' />
          </EmptyMedia>
          <EmptyTitle>{t("stats.live.waitingTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("stats.live.waitingDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={live.refresh} variant='outline'>
            {live.isDetecting ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Radio className='h-4 w-4' />
            )}
            {t("stats.live.checkNow")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const teams = [SAPPHIRE, 3].map((team) => ({
    team,
    players: live.players
      .filter((player) => player.team === team)
      .sort((a, b) => b.netWorth - a.netWorth),
  }));

  const renderPlayer = (player: LivePlayer) => {
    const profile = profiles.get(player.accountId);
    const rank = ranks.get(player.accountId);
    const mine = heroStats.filter(
      (entry) => entry.account_id === player.accountId,
    );
    const onHero = mine.find((entry) => entry.hero_id === player.heroId);
    const isSelf = player.accountId === ownAccountId;

    return (
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-accent",
          isSelf && "border-primary",
        )}
        key={player.steamId64}
        onClick={() => setSelected(player)}
        type='button'>
        <HeroAvatar
          className='h-9 w-9'
          hero={heroesById.get(player.heroId)}
          heroId={player.heroId}
        />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-1.5'>
            <span className='truncate font-medium text-sm'>
              {profile?.personaname ?? `#${player.accountId}`}
            </span>
            {isSelf && (
              <Badge className='shrink-0' variant='secondary'>
                {t("stats.live.you")}
              </Badge>
            )}
          </div>
          <div className='truncate text-muted-foreground text-xs'>
            {onHero
              ? t("stats.live.onHeroShort", {
                  matches: onHero.matches_played,
                  winrate: formatPercent(
                    onHero.wins / onHero.matches_played,
                    0,
                  ),
                })
              : t("stats.live.firstTimeHero")}
          </div>
        </div>
        <div className='shrink-0 text-right'>
          <div className='font-medium text-sm tabular-nums'>
            {player.kills}/{player.deaths}/{player.assists}
          </div>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {formatCompact(player.netWorth)}
            {rank && rank.badge > 0 && ` · ${rank.badge}`}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge className='gap-1.5' variant='secondary'>
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              live.status === "streaming"
                ? "animate-pulse bg-emerald-500"
                : "bg-muted-foreground",
            )}
          />
          {t(`stats.live.status.${live.status}`)}
        </Badge>
        <span className='text-muted-foreground text-xs'>
          {t("stats.live.matchId", { id: live.match.matchId })}
        </span>
      </div>

      {live.broadcastError && (
        <Alert variant='warning'>
          <TriangleAlert className='h-4 w-4' />
          <AlertDescription>{t("stats.live.broadcastError")}</AlertDescription>
        </Alert>
      )}

      {live.players.length === 0 ? (
        <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm'>
          <Loader2 className='h-4 w-4 animate-spin' />
          {live.isResolvingBroadcast
            ? t("stats.live.resolving")
            : t("stats.live.connecting")}
        </div>
      ) : (
        <div className='grid gap-4 lg:grid-cols-2'>
          {teams.map(({ team, players }) => (
            <Card className='flex flex-col gap-2 p-3 shadow-none' key={team}>
              <div className='flex items-center justify-between'>
                <span className='font-semibold text-sm'>
                  {t(
                    team === SAPPHIRE
                      ? "stats.live.sapphire"
                      : "stats.live.amber",
                  )}
                </span>
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {formatCompact(
                    players.reduce((sum, player) => sum + player.netWorth, 0),
                  )}
                </span>
              </div>
              {players.map(renderPlayer)}
            </Card>
          ))}
        </div>
      )}

      <LiveLeaderboard
        heroesById={heroesById}
        onSelect={setSelected}
        ownAccountId={ownAccountId}
        players={live.players}
        profiles={profiles}
      />

      <LiveMatchCharts samples={live.samples} />

      <LivePlayerDialog
        heroStats={heroStats}
        heroesById={heroesById}
        onOpenChange={(open) => !open && setSelected(null)}
        player={selected}
        profile={selected ? profiles.get(selected.accountId) : undefined}
        rank={selected ? ranks.get(selected.accountId) : undefined}
        rankAssets={rankAssets}
      />
    </div>
  );
};
