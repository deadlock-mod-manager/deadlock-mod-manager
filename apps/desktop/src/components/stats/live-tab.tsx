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
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { LiveLeaderboard } from "@/components/stats/live-leaderboard";
import { LiveMatchCharts } from "@/components/stats/live-match-chart";
import { PlayerDialog } from "@/components/stats/player-dialog";
import { useLiveMatch } from "@/hooks/use-live-match";
import { useReorderSafeSelect } from "@/hooks/use-reorder-safe-select";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { RankAsset } from "@/lib/stats/api";
import { formatCompact, formatPercent } from "@/lib/stats/format";
import {
  AMBER_TEAM,
  heroStatsByAccount,
  type LivePlayer,
  SAPPHIRE_TEAM,
} from "@/lib/stats/live";
import { cn } from "@/lib/utils";

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
  // Tagged with the match it was made in, so the dialog cannot survive into the
  // next lobby - not even when the same account shows up there again.
  const [selection, setSelection] = useState<{
    matchId: string | null;
    accountId: number;
  } | null>(null);
  const live = useLiveMatch();

  const { board, profiles, ranks, heroStats } = live;
  const boardMatchId = board?.matchId ?? null;

  // Grouped once for the whole board rather than re-scanned per player. This
  // and everything down to the empty states has to stay above them: every one
  // of those returns early, and a hook below would appear and disappear as a
  // match starts.
  const statsByAccount = useMemo(
    () => heroStatsByAccount(heroStats),
    [heroStats],
  );

  const select = useCallback(
    (player: LivePlayer) =>
      setSelection({ matchId: boardMatchId, accountId: player.accountId }),
    [boardMatchId],
  );
  // Team cards re-sort by souls every second, so a press has to stay tied to the
  // row it started on instead of the one that slid into its place.
  const { containerProps, itemProps } = useReorderSafeSelect(select);

  // Split and ranked here rather than in the render body: the view re-renders on
  // every tick of the stream, and both of these copy and sort the whole lobby.
  const teams = useMemo(
    () =>
      [SAPPHIRE_TEAM, AMBER_TEAM].map((team) => ({
        team,
        players: live.players
          .filter((player) => player.team === team)
          .sort((a, b) => b.netWorth - a.netWorth),
      })),
    [live.players],
  );

  // Derived from the live rows rather than held as its own copy, so the dialog
  // follows the scoreboard instead of freezing the moment it was opened.
  const selected =
    selection?.matchId === boardMatchId
      ? (live.players.find(
          (player) => player.accountId === selection.accountId,
        ) ?? null)
      : null;

  // The one way out of every dead end this tab can reach, so it is the same
  // button in all of them rather than one that only exists before a match.
  const checkNowButton = (
    <Button onClick={live.refresh} variant='outline'>
      {live.isDetecting ? (
        <Loader2 className='h-4 w-4 animate-spin' />
      ) : (
        <Radio className='h-4 w-4' />
      )}
      {t("stats.live.checkNow")}
    </Button>
  );

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
  if (!board && live.queued) {
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

  if (!board) {
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
        <EmptyContent>{checkNowButton}</EmptyContent>
      </Empty>
    );
  }

  // What to say while there is no scoreboard yet. A stream that already failed
  // or ended is done, so spinning on it would just look like a hang - it gets
  // the retry the copy points at instead. Nothing reconnects on its own from
  // here, so leaving the button out was leaving the tab with no way forward.
  const renderEmptyBoard = () => {
    // The alert above already says what went wrong; only the way out is missing.
    if (live.broadcastError) {
      return <div className='flex justify-center py-16'>{checkNowButton}</div>;
    }
    if (live.status === "error" || live.status === "ended") {
      return (
        <div className='flex flex-col items-center gap-4 py-16'>
          <span className='text-center text-muted-foreground text-sm'>
            {t("stats.live.streamError")}
          </span>
          {checkNowButton}
        </div>
      );
    }
    return (
      <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {live.isResolvingBroadcast
          ? t("stats.live.resolving")
          : t("stats.live.connecting")}
      </div>
    );
  };

  const renderPlayer = (player: LivePlayer) => {
    const profile = profiles.get(player.accountId);
    const rank = ranks.get(player.accountId);
    const onHero = statsByAccount
      .get(player.accountId)
      ?.find((entry) => entry.hero_id === player.heroId);
    const isSelf = player.accountId === ownAccountId;

    return (
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-accent",
          isSelf && "border-primary",
        )}
        key={player.steamId64}
        type='button'
        {...itemProps(player)}>
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
              ? t("stats.player.onHeroShort", {
                  matches: onHero.matches_played,
                  winrate: formatPercent(
                    onHero.wins / onHero.matches_played,
                    0,
                  ),
                })
              : t("stats.player.firstTimeHero")}
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
        {!board.isRunning && (
          <Badge variant='outline'>{t("stats.live.lastMatch")}</Badge>
        )}
        {/* The board of the match just played stays up until the next one
            starts, so the queue for that next one has to be visible next to it -
            otherwise searching looks exactly like sitting in the menu. */}
        {live.queued && (
          <Badge className='gap-1.5' variant='outline'>
            <span className='relative flex h-2 w-2'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60' />
              <span className='relative inline-flex h-2 w-2 rounded-full bg-primary' />
            </span>
            {t("stats.live.queuedBadge")}
          </Badge>
        )}
        <span className='text-muted-foreground text-xs'>
          {t("stats.live.matchId", { id: board.matchId })}
        </span>
      </div>

      {live.broadcastError && (
        <Alert variant='warning'>
          <TriangleAlert className='h-4 w-4' />
          <AlertDescription>{t("stats.live.broadcastError")}</AlertDescription>
        </Alert>
      )}

      {live.players.length === 0 ? (
        renderEmptyBoard()
      ) : (
        <div className='grid gap-4 lg:grid-cols-2'>
          {teams.map(({ team, players }) => (
            <Card
              className='flex flex-col gap-2 p-3 shadow-none'
              key={team}
              {...containerProps}>
              <div className='flex items-center justify-between'>
                <span className='font-semibold text-sm'>
                  {t(
                    team === SAPPHIRE_TEAM
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
        onSelect={select}
        ownAccountId={ownAccountId}
        players={live.players}
        profiles={profiles}
      />

      <LiveMatchCharts samples={live.samples} />

      <PlayerDialog
        accountId={selected?.accountId ?? null}
        heroesById={heroesById}
        live={selected}
        onOpenChange={(open) => !open && setSelection(null)}
        profile={selected ? profiles.get(selected.accountId) : undefined}
        rankAssets={rankAssets}
        seed={
          selected
            ? {
                heroStats: statsByAccount.get(selected.accountId),
                rank: ranks.get(selected.accountId),
              }
            : undefined
        }
      />
    </div>
  );
};
