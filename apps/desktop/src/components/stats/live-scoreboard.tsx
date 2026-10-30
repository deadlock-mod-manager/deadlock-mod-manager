import { Button } from "@deadlock-mods/ui/components/button";
import { FileWarning, Loader2, Puzzle, Radio } from "@deadlock-mods/ui/icons";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PENDING_COLOR, WARN_COLOR } from "@/components/stats/chart-fx";
import {
  LiveBanner,
  LiveClosedBanner,
  LiveInstallBanner,
  LiveMatchOverBanner,
  LiveQueuedBanner,
} from "@/components/stats/live-banners";
import {
  LiveLastMatchCard,
  LivePreview,
  LiveSessionCard,
} from "@/components/stats/live-between";
import { LiveNowStrip } from "@/components/stats/live-now-strip";
import { LivePace, type LivePaceNotice } from "@/components/stats/live-pace";
import { LiveScouting } from "@/components/stats/live-scouting";
import { LiveSoulsCurve } from "@/components/stats/live-souls-curve";
import { LiveTeamBoard } from "@/components/stats/live-team-board";
import { LiveTopBar } from "@/components/stats/live-top-bar";
import {
  type LiveScoreboardYou,
  type LiveSource,
  useRealLiveSource,
} from "@/hooks/use-live-source";
import { useHeroCatalog } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { type RankAsset, resolveRank } from "@/lib/stats/api";
import { formatClock } from "@/lib/stats/format";
import {
  liveGradeRows,
  MIN_GRADED_MINUTES,
  overallGrade,
} from "@/lib/stats/live-grades";
import { resolveBoard, teamColor } from "@/lib/stats/live-teams";
import { liveViewState } from "@/lib/stats/live-view";
import type { StatsScope } from "@/lib/stats/scope";
import type { LiveScoreboard as LiveBoard } from "@/types/generated/LiveScoreboard";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";

type HeroFor = (player: LiveScoreboardPlayer) => DeadlockHero | undefined;

interface LiveScoreboardProps {
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  scope: StatsScope;
  you: LiveScoreboardYou;
}

/** What the dev-only fixture switch needs to stand in for the live source. */
export interface LiveMockSwitchProps {
  heroIdOf: (heroName: string) => number | undefined;
  /** The tab on the running game, shown while no fixture is picked. */
  live: ReactNode;
  renderView: (source: LiveSource) => ReactNode;
}

// Development builds only: fixtures for each state, so they can be checked
// without a running match. Production builds drop the import entirely.
const LiveMockSwitch = import.meta.env.DEV
  ? lazy(() =>
      import("@/components/stats/live-mock-switch").then((module) => ({
        default: module.LiveMockSwitch,
      })),
    )
  : null;

const MUTED = "hsl(var(--muted-foreground))";

/** The running match as the in-game top bar shows it. */
export const LiveScoreboard = ({
  heroesById,
  rankAssets,
  scope,
  you,
}: LiveScoreboardProps) => {
  const { heroByName } = useHeroCatalog();
  // The top bar may have no readable hero id, only the hero's display name.
  const heroFor = useCallback<HeroFor>(
    (player) =>
      (player.heroId === null ? undefined : heroesById.get(player.heroId)) ??
      (player.heroName === null ? undefined : heroByName(player.heroName)),
    [heroesById, heroByName],
  );
  const heroIdOf = useCallback(
    (heroName: string) => heroByName(heroName)?.id,
    [heroByName],
  );
  const renderView = (source: LiveSource) => (
    <LiveView
      heroFor={heroFor}
      heroesById={heroesById}
      rankAssets={rankAssets}
      source={source}
    />
  );
  const live = (
    <RealLiveView
      heroFor={heroFor}
      renderView={renderView}
      scope={scope}
      you={you}
    />
  );

  return (
    <div className='flex flex-col gap-4'>
      {LiveMockSwitch ? (
        <Suspense fallback={null}>
          <LiveMockSwitch
            heroIdOf={heroIdOf}
            live={live}
            renderView={renderView}
          />
        </Suspense>
      ) : (
        live
      )}
    </div>
  );
};

const RealLiveView = ({
  heroFor,
  renderView,
  scope,
  you,
}: {
  heroFor: HeroFor;
  renderView: (source: LiveSource) => ReactNode;
  scope: StatsScope;
  you: LiveScoreboardYou;
}) => renderView(useRealLiveSource({ you, scope, heroFor }));

interface LiveViewProps {
  source: LiveSource;
  heroFor: HeroFor;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
}

const LiveView = ({
  source,
  heroFor,
  heroesById,
  rankAssets,
}: LiveViewProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = liveViewState({
    status: source.status,
    gameRunning: source.gameRunning,
    needsSetup: source.bridge.needsSetup,
    now: Date.now(),
  });

  const lastMatch = [...source.matches].sort(
    (a, b) => b.start_time - a.start_time,
  )[0];
  // Between matches the outline's middle row shows how the day is going.
  const between = (
    <LivePreview
      left={
        <LiveSessionCard
          badge={source.badge}
          heroesById={heroesById}
          matches={source.matches}
          rankAssets={rankAssets}
        />
      }
      right={
        lastMatch && (
          <LiveLastMatchCard
            grade={source.finalGrades[String(lastMatch.match_id)]}
            hero={heroesById.get(lastMatch.hero_id)}
            lastMatch={lastMatch}
          />
        )
      }
    />
  );

  const body = (() => {
    switch (state.kind) {
      case "checking":
        return (
          <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm'>
            <Loader2 className='h-4 w-4 animate-spin' />
            {t("stats.live.checking")}
          </div>
        );
      case "condebug":
        return (
          <>
            <LiveBanner
              aside={
                <Button
                  onClick={() =>
                    navigate("/settings", {
                      state: { activeTab: "launch-options" },
                    })
                  }>
                  {t("stats.live.openSettings")}
                </Button>
              }
              color={WARN_COLOR}
              description={t("stats.live.condebugDescription")}
              icon={<FileWarning className='h-6 w-6' />}
              title={t("stats.live.condebugTitle")}
            />
            <LivePreview />
          </>
        );
      case "scouting":
        return (
          <LiveScouting
            board={resolveBoard(state.board, heroFor)}
            lobby={source.lobby}
            rankAssets={rankAssets}
          />
        );
      case "match":
        return (
          <LiveMatch
            board={state.board}
            heroFor={heroFor}
            isOver={state.isOver}
            matchId={state.matchId}
            rankAssets={rankAssets}
            source={source}
          />
        );
      case "needsSetup":
        return (
          <>
            <LiveInstallBanner
              inLibrary={source.bridge.inLibrary}
              isInstalling={source.bridge.isInstalling}
              onInstall={source.bridge.install}
            />
            <LivePreview />
          </>
        );
      case "closed":
        return (
          <>
            <LiveClosedBanner />
            {between}
          </>
        );
      case "queued":
        return (
          <>
            <LiveQueuedBanner since={state.since} />
            {between}
          </>
        );
      case "pregameLoading":
        return (
          <>
            <LiveBanner
              color={PENDING_COLOR}
              description={t("stats.live.pregame.loadingDescription")}
              icon={<Loader2 className='h-6 w-6 animate-spin' />}
              title={t("stats.live.pregame.loadingTitle")}
            />
            <LivePreview />
          </>
        );
      case "matchOverNoBoard":
        return (
          <>
            <LiveBanner
              color={MUTED}
              description={t("stats.live.matchOverDescription")}
              icon={<Radio className='h-6 w-6' />}
              title={t("stats.live.matchOverTitle")}
            />
            <LivePreview />
          </>
        );
      case "noBridge":
        return (
          <>
            <LiveBanner
              color={WARN_COLOR}
              description={t("stats.live.noBridgeDescription")}
              icon={<Puzzle className='h-6 w-6' />}
              title={t("stats.live.noBridgeTitle")}
            />
            <LivePreview />
          </>
        );
      case "waiting":
        return (
          <>
            <LiveBanner
              color={MUTED}
              description={t("stats.live.waitingDescription")}
              icon={<Radio className='h-6 w-6' />}
              title={t("stats.live.waitingTitle")}
            />
            {between}
          </>
        );
    }
  })();

  return <div className='flex flex-col gap-4 pb-8'>{body}</div>;
};

const LiveMatch = ({
  board,
  matchId,
  isOver,
  source,
  heroFor,
  rankAssets,
}: {
  board: LiveBoard;
  matchId: string | null;
  isOver: boolean;
  source: LiveSource;
  heroFor: HeroFor;
  rankAssets: RankAsset[];
}) => {
  const { t } = useTranslation();
  const { badge, curve, lobby, matches, yourAccountId, rememberGrade } = source;
  const resolved = useMemo(
    () => resolveBoard(board, heroFor),
    [board, heroFor],
  );
  const you = resolved.friendly.find(({ player }) => player.isLocal);
  const localPlayer = you?.player;
  const localHero = you?.hero;
  const clockSeconds = board.clockSeconds;
  const minutes = clockSeconds === null ? null : clockSeconds / 60;
  const clock = clockSeconds === null ? null : formatClock(clockSeconds);
  const rows = useMemo(
    () =>
      localPlayer && minutes !== null
        ? liveGradeRows({ player: localPlayer, minutes, curve })
        : [],
    [localPlayer, minutes, curve],
  );
  const overall = overallGrade(rows);
  useEffect(() => {
    if (rememberGrade && !isOver && matchId && overall) {
      rememberGrade(matchId, overall.grade);
    }
  }, [rememberGrade, isOver, matchId, overall?.grade]);

  const bracketName = resolveRank(badge, rankAssets).name ?? null;
  const heroName = localHero?.name ?? localPlayer?.heroName ?? "";
  const notice: LivePaceNotice | null = !localHero
    ? "unknownHero"
    : minutes === null || minutes < MIN_GRADED_MINUTES
      ? "firstMinute"
      : source.benchmarkPending
        ? "loading"
        : rows.length === 0
          ? "unavailable"
          : null;

  return (
    <>
      {isOver && (
        <LiveMatchOverBanner
          clock={clock}
          inHistory={matches.some(
            (match) => String(match.match_id) === matchId,
          )}
          matchId={matchId}
          result={source.result}
        />
      )}
      {you ? (
        <LiveNowStrip
          badge={badge}
          bracketName={bracketName}
          clock={clock}
          isOver={isOver}
          minutes={minutes}
          onHero={
            localHero && yourAccountId !== null
              ? lobby.records.get(yourAccountId)?.heroes.get(localHero.id)
              : undefined
          }
          overall={overall}
          rankAssets={rankAssets}
          team={board.team}
          you={you}
        />
      ) : (
        <div className='stats-surface rounded-xl border p-4 text-center text-muted-foreground text-sm'>
          {t("stats.live.performance.spectating")}
        </div>
      )}
      <LiveTopBar board={resolved} />
      {localPlayer && (
        <div className='grid gap-4 xl:grid-cols-[minmax(0,1.95fr)_minmax(0,1fr)]'>
          <LivePace
            clock={clock}
            minutes={minutes}
            notice={notice}
            peers={bracketName ? `${bracketName} ${heroName}` : heroName}
            rows={rows}
          />
          {minutes !== null &&
            localPlayer.souls !== null &&
            curve.length > 0 && (
              // Side by side, the pace card sets the row's height and the
              // chart fills what it leaves.
              <div className='relative min-h-[26rem] xl:min-h-0'>
                <LiveSoulsCurve
                  className='xl:absolute xl:inset-0'
                  color={teamColor(board.team)}
                  curve={curve}
                  minutes={minutes}
                  souls={localPlayer.souls}
                  trail={source.trail}
                />
              </div>
            )}
        </div>
      )}
      <LiveTeamBoard board={resolved} lobby={lobby} rankAssets={rankAssets} />
    </>
  );
};
