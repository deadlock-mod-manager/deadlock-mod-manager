import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { UserRound } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import {
  BuildTimeline,
  FinalBuild,
  SoulsSpent,
  TimingCompare,
} from "@/components/stats/match/match-build";
import {
  isMatchView,
  MatchHeader,
  type MatchView,
  type RankChange,
} from "@/components/stats/match/match-header";
import {
  DuelsPanel,
  LanePanel,
  LobbyRoster,
} from "@/components/stats/match/match-lobby";
import {
  LobbyPlacements,
  Scoreboard,
  SoulLeadChart,
} from "@/components/stats/match/match-overview";
import { MatchUnavailable } from "@/components/stats/match/match-unavailable";
import { PlayerDialog } from "@/components/stats/player-dialog";
import {
  useHeroBaseline,
  useHeroCatalog,
  useMatchDetails,
  useMatchProfiles,
  usePlayerHistory,
  usePlayerStats,
  useRankAssets,
} from "@/hooks/use-player-stats";
import { useSelectedSteamAccount } from "@/hooks/use-steam-accounts";
import type {
  MatchHistoryEntry,
  MatchMetadata,
  MatchMetadataPlayer,
  RankAsset,
  SteamProfile,
} from "@/lib/stats/api";
import { rankLabel } from "@/lib/stats/api";
import type { DeadlockHero, DeadlockItem } from "@/lib/deadlock-api";
import {
  duels,
  laneMatchup,
  lobbyPlacements,
  type Placement,
  type Purchase,
  purchases,
} from "@/lib/stats/match-analysis";
import { badgeToStep } from "@/lib/stats/rank";

const EMPTY_RANK_ASSETS: RankAsset[] = [];

/** The ranked badge after this match against the one shown before it. */
const rankChangeFor = (
  history: MatchHistoryEntry[],
  matchId: number,
  rankAssets: RankAsset[],
): RankChange | null => {
  const ranked = history
    .filter(
      (entry) =>
        entry.ranked_display_badge !== null && entry.ranked_display_badge > 0,
    )
    .sort((a, b) => a.start_time - b.start_time);
  const index = ranked.findIndex((entry) => entry.match_id === matchId);
  const after = ranked[index]?.ranked_display_badge;
  const before = ranked[index - 1]?.ranked_display_badge;
  if (index < 1 || !after || !before) return null;
  return {
    steps: badgeToStep(after) - badgeToStep(before),
    from: rankLabel(before, rankAssets) ?? "",
    to: rankLabel(after, rankAssets) ?? "",
  };
};

interface MatchBodyProps {
  accountId: number;
  profiles: Map<number, SteamProfile>;
  match: MatchMetadata["match_info"];
  me: MatchMetadataPlayer;
  view: MatchView;
  heroesById: Map<number, DeadlockHero>;
  itemsById: Map<number, DeadlockItem>;
  rankAssets: RankAsset[];
  placements: Placement[];
  bought: Purchase[];
  onSelectPlayer: (accountId: number) => void;
}

const MatchBody = ({
  accountId,
  profiles,
  match,
  me,
  view,
  heroesById,
  itemsById,
  rankAssets,
  placements,
  bought,
  onSelectPlayer,
}: MatchBodyProps) => {
  const { t } = useTranslation();
  const nameOf = (id: number) =>
    profiles.get(id)?.personaname ?? t("stats.unknownPlayer");
  const baseline = useHeroBaseline(accountId, me.hero_id, view === "build");
  const history = usePlayerHistory(accountId, view === "lobby");

  if (view === "build") {
    return (
      <div className='flex flex-col gap-4'>
        <BuildTimeline bought={bought} duration={match.duration_s} me={me} />
        <div className='grid gap-4 lg:grid-cols-[minmax(300px,340px)_1fr] xl:grid-cols-[340px_1fr_330px]'>
          <SoulsSpent bought={bought} />
          <TimingCompare
            bought={bought}
            buyTimes={baseline.buyTimes}
            curve={baseline.curve}
            duration={match.duration_s}
            heroName={heroesById.get(me.hero_id)?.name ?? `#${me.hero_id}`}
            isPending={baseline.isPending}
            me={me}
          />
          <FinalBuild bought={bought} />
        </div>
      </div>
    );
  }

  if (view === "lobby") {
    const lane = laneMatchup(match.players, me);
    return (
      <div className='flex flex-col gap-4'>
        <div className='grid gap-4 xl:grid-cols-[460px_1fr]'>
          {lane && (
            <LanePanel
              heroesById={heroesById}
              meId={accountId}
              nameOf={nameOf}
              sides={lane}
            />
          )}
          <div className={lane ? undefined : "xl:col-span-2"}>
            <DuelsPanel
              duels={duels(match.players, me)}
              heroesById={heroesById}
              nameOf={nameOf}
            />
          </div>
        </div>
        <LobbyRoster
          enemies={history.enemies}
          heroesById={heroesById}
          match={match}
          mates={history.mates}
          meId={accountId}
          nameOf={nameOf}
          onSelectPlayer={onSelectPlayer}
          party={history.party}
          rankAssets={rankAssets}
        />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid gap-4 xl:grid-cols-[1fr_380px]'>
        <SoulLeadChart
          duration={match.duration_s}
          myTeam={me.team}
          players={match.players}
        />
        <LobbyPlacements placements={placements} />
      </div>
      <Scoreboard
        heroesById={heroesById}
        itemsById={itemsById}
        match={match}
        meId={accountId}
        onSelectPlayer={onSelectPlayer}
        profiles={profiles}
      />
    </div>
  );
};

const MatchSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <Skeleton className='h-8 w-72' />
    <Skeleton className='h-[110px] w-full rounded-xl' />
    <div className='grid gap-4 xl:grid-cols-[1fr_380px]'>
      <Skeleton className='h-[340px] w-full rounded-xl' />
      <Skeleton className='h-[340px] w-full rounded-xl' />
    </div>
    <Skeleton className='h-[420px] w-full rounded-xl' />
  </div>
);

/** One match on its own page: what happened, what was built, and who was there. */
const StatsMatch = () => {
  const { t } = useTranslation();
  const matchId = Number(useParams().matchId);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const view: MatchView = isMatchView(viewParam) ? viewParam : "overview";
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);

  const { accountId, isPending: accountsPending } = useSelectedSteamAccount();
  const stats = usePlayerStats(accountId);
  const { heroesById } = useHeroCatalog();
  const rankAssets = useRankAssets().data?.data ?? EMPTY_RANK_ASSETS;
  const details = useMatchDetails(
    Number.isFinite(matchId) ? matchId : null,
    accountId,
  );

  const playerIds = useMemo(
    () => (details.match?.players ?? []).map((player) => player.account_id),
    [details.match],
  );
  const profiles = useMatchProfiles(matchId, playerIds);

  const { previousId, nextId } = useMemo(() => {
    // `matches` is already limited to normal games, so Street Brawl is skipped.
    const ordered = [...stats.matches].sort(
      (a, b) => b.start_time - a.start_time,
    );
    const index = ordered.findIndex((entry) => entry.match_id === matchId);
    return {
      previousId: index >= 0 ? (ordered[index + 1]?.match_id ?? null) : null,
      nextId: index > 0 ? (ordered[index - 1]?.match_id ?? null) : null,
    };
  }, [stats.matches, matchId]);

  const rankChange = useMemo(
    () => rankChangeFor(stats.matches, matchId, rankAssets),
    [stats.matches, matchId, rankAssets],
  );

  const placements = useMemo(
    () =>
      details.match && details.player
        ? lobbyPlacements(details.match.players, details.player)
        : [],
    [details.match, details.player],
  );
  const bought = useMemo(
    () =>
      details.player ? purchases(details.player.items, details.itemsById) : [],
    [details.player, details.itemsById],
  );

  const body = (() => {
    if (accountsPending || details.isPending) {
      return <MatchSkeleton />;
    }
    if (details.isError || !details.match) {
      const entry = stats.matches.find((match) => match.match_id === matchId);
      return (
        <MatchUnavailable
          entry={entry}
          hero={entry ? heroesById.get(entry.hero_id) : undefined}
          isRetrying={details.isFetching}
          onRetry={() => void details.refetch()}
        />
      );
    }
    const me = details.player;
    if (!me || accountId === null) {
      return (
        <Empty className='py-16'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <UserRound />
            </EmptyMedia>
            <EmptyTitle>{t("stats.match.notInMatchTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("stats.match.notInMatchDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <div className='flex flex-col gap-4'>
        <MatchHeader
          damageRank={
            placements.find((placement) => placement.metric === "damage")
              ?.rank ?? null
          }
          hero={heroesById.get(me.hero_id)}
          match={details.match}
          me={me}
          nextId={nextId}
          onViewChange={(next) =>
            setSearchParams(
              (params) => {
                params.set("view", next);
                return params;
              },
              { replace: true },
            )
          }
          previousId={previousId}
          rankChange={rankChange}
          view={view}
        />
        <MatchBody
          accountId={accountId}
          profiles={profiles}
          heroesById={heroesById}
          itemsById={details.itemsById}
          match={details.match}
          me={me}
          bought={bought}
          onSelectPlayer={setSelectedPlayer}
          placements={placements}
          rankAssets={rankAssets}
          view={view}
        />
      </div>
    );
  })();

  return (
    <div className='h-full min-h-0 w-full overflow-y-auto px-4 pt-2 pr-2 pb-8'>
      {body}
      <PlayerDialog
        accountId={selectedPlayer}
        heroesById={heroesById}
        onOpenChange={(open) => {
          if (!open) setSelectedPlayer(null);
        }}
        profile={
          selectedPlayer === null ? undefined : profiles.get(selectedPlayer)
        }
        rankAssets={rankAssets}
      />
    </div>
  );
};

export default StatsMatch;
