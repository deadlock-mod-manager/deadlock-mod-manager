import { Button } from "@deadlock-mods/ui/components/button";
import { FileWarning, Loader2, Puzzle, Radio } from "@deadlock-mods/ui/icons";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { LiveNowStrip } from "@/components/stats/live-now-strip";
import { LivePace, type LivePaceNotice } from "@/components/stats/live-pace";
import { teamColor } from "@/components/stats/live-parts";
import { LiveScouting } from "@/components/stats/live-scouting";
import { LiveSoulsCurve } from "@/components/stats/live-souls-curve";
import {
  LiveBanner,
  LiveClosedBanner,
  LiveInstallBanner,
  LiveLastMatchCard,
  LiveMatchOverBanner,
  LivePreview,
  LiveQueuedBanner,
  LiveSessionCard,
} from "@/components/stats/live-states";
import { LiveTeamBoard } from "@/components/stats/live-team-board";
import { LiveTopBar } from "@/components/stats/live-top-bar";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import {
  useFinalGrades,
  useLiveMatchDetection,
  usePublishLiveHeadline,
  useQueuedSince,
  useSoulsTrail,
} from "@/hooks/use-live-match";
import { useLiveMock } from "@/hooks/use-live-mock";
import { useGameRunning } from "@/hooks/use-mod-health";
import { useLiveHeroBenchmark, useLiveLobby } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type MatchHistoryEntry,
  type PlayerRank,
  type RankAsset,
  resolveRank,
} from "@/lib/stats/api";
import { formatClock } from "@/lib/stats/format";
import {
  liveGradeRows,
  MIN_GRADED_MINUTES,
  overallGrade,
} from "@/lib/stats/live-grades";
import {
  LIVE_MOCK_SCENARIOS,
  type LiveMockScenario,
} from "@/lib/stats/live-mock";
import type { StatsScope } from "@/lib/stats/scope";
import { cn } from "@/lib/utils";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";

/** What the page already knows about the selected account. */
interface LiveScoreboardYou {
  accountId: number | null;
  rank: PlayerRank | null;
  matches: MatchHistoryEntry[];
}

interface LiveScoreboardProps {
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  scope: StatsScope;
  you: LiveScoreboardYou;
}

const WARN_COLOR = "#fbbf24";
const AMBER = "#f59e0b";
const MUTED = "hsl(var(--muted-foreground))";

/** The bridge repeats an unchanged board every 20 seconds, so this is overdue. */
const BRIDGE_STALE_MS = 45_000;

/**
 * Whether the bridge reported recently. Bot and practice matches log no lobby
 * line, so this is what tells them apart from a finished match.
 */
const isRecentReport = (reportedAt: number | null, now: number): boolean =>
  reportedAt !== null && now - reportedAt < BRIDGE_STALE_MS;

/** Development builds only: switches the tab between its fixtures. */
const MockPicker = ({
  scenario,
  onChange,
}: {
  scenario: LiveMockScenario | null;
  onChange: (scenario: LiveMockScenario | null) => void;
}) => (
  <div className='fixed right-4 bottom-12 z-50 flex flex-wrap items-center gap-1 rounded-lg border border-dashed bg-background/95 p-1 font-mono text-[11px] shadow-lg'>
    <span className='px-1.5 text-muted-foreground'>mock</span>
    {[null, ...LIVE_MOCK_SCENARIOS].map((option) => (
      <button
        className={cn(
          "rounded px-2 py-0.5 text-muted-foreground",
          option === scenario && "bg-secondary text-foreground",
        )}
        key={option ?? "off"}
        onClick={() => onChange(option)}
        type='button'>
        {option ?? "off"}
      </button>
    ))}
  </div>
);

/**
 * The running match as the in-game top bar shows it. Everything live comes from
 * the console log: the live bridge HUD mod prints the scoreboard there, so no
 * API is asked to spectate anything.
 */
export const LiveScoreboard = (props: LiveScoreboardProps) => {
  const { heroesById } = props;

  // The top bar has no readable hero id, only the hero's display name, which
  // matches the catalog's English names.
  const heroesByName = useMemo(
    () =>
      new Map(
        [...heroesById.values()].map((hero) => [hero.name.toLowerCase(), hero]),
      ),
    [heroesById],
  );
  const heroIdOf = useCallback(
    (name: string) => heroesByName.get(name.toLowerCase())?.id,
    [heroesByName],
  );
  const { mock, scenario, setScenario } = useLiveMock(heroIdOf);

  return (
    <div className='flex flex-col gap-4'>
      {import.meta.env.DEV && (
        <MockPicker onChange={setScenario} scenario={scenario} />
      )}
      <LiveView
        {...props}
        heroesByName={heroesByName}
        // A new fixture remounts the view, so no state leaks between them.
        key={scenario ?? "live"}
        mock={mock}
      />
    </div>
  );
};

const LiveView = ({
  heroesById,
  heroesByName,
  rankAssets,
  scope,
  you,
  mock,
}: LiveScoreboardProps & {
  heroesByName: Map<string, DeadlockHero>;
  mock: ReturnType<typeof useLiveMock>["mock"];
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const live = useLiveMatchDetection(!mock);
  const bridge = useLiveBridge();
  const realGameRunning = useGameRunning();
  const gameRunning = mock ? mock.gameRunning : realGameRunning;
  const raw = mock ? mock.status : live.data;
  // console.log outlives the game, so with Deadlock closed nothing in it is
  // current. Only a lobby line marks a real match; the hideout runs the same
  // top bar without one.
  const phase = gameRunning ? (raw?.current?.phase ?? null) : null;
  const isPregame = phase === "pregame";
  const isInProgress = phase === "inProgress";
  const isOver = phase === "ended";
  // In the match the bridge reports throughout, so a quiet board is from a
  // session that never wrote the log. Before it, the top bar may not exist yet.
  const reportedRecently =
    !!mock || isRecentReport(raw?.scoreboard?.reportedAt ?? null, Date.now());
  const board =
    raw?.scoreboard &&
    (isPregame || isOver || (isInProgress && reportedRecently))
      ? raw.scoreboard
      : null;
  const queued = gameRunning && !!raw?.queued;
  const needsSetup = mock ? mock.bridgeNeedsSetup : bridge.needsSetup;

  const heroFor = (player: LiveScoreboardPlayer) =>
    (player.heroId === null ? undefined : heroesById.get(player.heroId)) ??
    (player.heroName === null
      ? undefined
      : heroesByName.get(player.heroName.toLowerCase()));

  const lobbyAccounts = useMemo(
    () =>
      [...(board?.friendly ?? []), ...(board?.enemy ?? [])].flatMap((player) =>
        player.accountId === null ? [] : [player.accountId],
      ),
    [board?.friendly, board?.enemy],
  );

  const localPlayer = board?.friendly.find((player) => player.isLocal);
  const localHero = localPlayer ? heroFor(localPlayer) : undefined;
  const yourAccountId = mock
    ? mock.yourAccountId
    : (you.accountId ?? localPlayer?.accountId ?? null);
  const realLobby = useLiveLobby({
    accountIds: mock ? [] : lobbyAccounts,
    yourAccountId: mock ? null : yourAccountId,
    yourHeroId: mock ? null : (localHero?.id ?? null),
  });
  const lobby = mock?.lobby ?? realLobby;

  const badge =
    mock?.yourBadge ??
    (yourAccountId === null ? undefined : lobby.ranks.get(yourAccountId)) ??
    you.rank?.badge;
  const benchmark = useLiveHeroBenchmark(
    mock ? null : (localHero?.id ?? null),
    badge,
    scope,
  );
  const curve = mock?.curve ?? benchmark.data?.data ?? [];
  const clockSeconds = board?.clockSeconds ?? null;
  const minutes = clockSeconds === null ? null : clockSeconds / 60;
  const clock = clockSeconds === null ? null : formatClock(clockSeconds);
  const rows = useMemo(
    () =>
      localPlayer && minutes !== null
        ? liveGradeRows({ player: localPlayer, minutes, curve })
        : [],
    [localPlayer, minutes, curve],
  );
  const realTrail = useSoulsTrail(
    raw?.current?.matchId ?? null,
    isInProgress && !mock ? minutes : null,
    localPlayer?.souls ?? null,
  );
  const trail = mock?.trail ?? realTrail;
  const realQueuedSince = useQueuedSince(!mock && queued);
  const queuedSince = mock ? mock.queuedSince : realQueuedSince;
  const matches = mock?.matches ?? you.matches;
  const finalGrades = useFinalGrades();
  const overall = overallGrade(rows);
  const matchId = raw?.current?.matchId ?? null;
  usePublishLiveHeadline(
    board && (isPregame || isInProgress)
      ? {
          source: isPregame ? "versusScreen" : "topBar",
          reportedAt: board.reportedAt,
          matchId,
        }
      : null,
  );
  const rememberGrade = finalGrades.remember;
  useEffect(() => {
    if (!mock && isInProgress && matchId && overall) {
      rememberGrade(matchId, overall.grade);
    }
  }, [mock, isInProgress, matchId, overall?.grade, rememberGrade]);

  if (!raw) {
    return (
      <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t("stats.live.checking")}
      </div>
    );
  }

  const lastMatch = [...matches].sort((a, b) => b.start_time - a.start_time)[0];
  // Between matches the outline's middle row shows how the day is going.
  const between = (
    <LivePreview
      left={
        <LiveSessionCard
          badge={badge}
          heroesById={heroesById}
          matches={matches}
          rankAssets={rankAssets}
        />
      }
      right={
        lastMatch && (
          <LiveLastMatchCard
            grade={
              (mock?.finalGrades ?? finalGrades.grades)[
                String(lastMatch.match_id)
              ]
            }
            hero={heroesById.get(lastMatch.hero_id)}
            lastMatch={lastMatch}
          />
        )
      }
    />
  );

  // console.log only exists with -condebug, and everything here is read from it.
  if (!raw.consoleLogAvailable) {
    return (
      <div className='flex flex-col gap-4 pb-8'>
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
      </div>
    );
  }

  if (board && isPregame) {
    return (
      <LiveScouting
        board={board}
        heroFor={heroFor}
        lobby={lobby}
        rankAssets={rankAssets}
      />
    );
  }

  if (board && (isInProgress || isOver)) {
    const bracketName = resolveRank(badge, rankAssets).name ?? null;
    const heroName = localHero?.name ?? localPlayer?.heroName ?? "";
    const notice: LivePaceNotice | null = !localHero
      ? "unknownHero"
      : minutes === null || minutes < MIN_GRADED_MINUTES
        ? "firstMinute"
        : !mock && benchmark.isPending
          ? "loading"
          : rows.length === 0
            ? "unavailable"
            : null;
    return (
      <div className='flex flex-col gap-4 pb-8'>
        {isOver && (
          <LiveMatchOverBanner
            clock={clock}
            inHistory={matches.some(
              (match) => String(match.match_id) === matchId,
            )}
            matchId={matchId}
            result={mock?.result ?? null}
          />
        )}
        {localPlayer ? (
          <LiveNowStrip
            badge={badge}
            bracketName={bracketName}
            clock={clock}
            hero={localHero}
            isOver={isOver}
            minutes={minutes}
            onHero={
              localHero && yourAccountId !== null
                ? lobby.records.get(yourAccountId)?.heroes.get(localHero.id)
                : undefined
            }
            overall={overall}
            player={localPlayer}
            rankAssets={rankAssets}
            team={board.team}
          />
        ) : (
          <div className='stats-surface rounded-xl border p-4 text-center text-muted-foreground text-sm'>
            {t("stats.live.performance.spectating")}
          </div>
        )}
        <LiveTopBar
          enemy={board.enemy}
          friendly={board.friendly}
          friendlyTeam={board.team}
          heroFor={heroFor}
        />
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
                    trail={trail}
                  />
                </div>
              )}
          </div>
        )}
        <LiveTeamBoard
          enemy={board.enemy}
          friendly={board.friendly}
          friendlyTeam={board.team}
          heroFor={heroFor}
          lobby={lobby}
          rankAssets={rankAssets}
        />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className='flex flex-col gap-4 pb-8'>
        <LiveInstallBanner
          inLibrary={!mock && bridge.inLibrary}
          isInstalling={bridge.install.isPending}
          onInstall={() => bridge.install.mutate()}
        />
        <LivePreview />
      </div>
    );
  }
  if (!gameRunning) {
    return (
      <div className='flex flex-col gap-4 pb-8'>
        <LiveClosedBanner />
        {between}
      </div>
    );
  }
  if (queued && !raw.current) {
    return (
      <div className='flex flex-col gap-4 pb-8'>
        <LiveQueuedBanner since={queuedSince} />
        {between}
      </div>
    );
  }

  // A match without a board means the game was started before the bridge was
  // installed, or the top bar has not appeared yet.
  const state =
    raw.current && isPregame
      ? {
          icon: <Loader2 className='h-6 w-6 animate-spin' />,
          color: AMBER,
          title: t("stats.live.pregame.loadingTitle"),
          description: t("stats.live.pregame.loadingDescription"),
        }
      : raw.current && !isInProgress
        ? {
            icon: <Radio className='h-6 w-6' />,
            color: MUTED,
            title: t("stats.live.matchOverTitle"),
            description: t("stats.live.matchOverDescription"),
          }
        : raw.current
          ? {
              icon: <Puzzle className='h-6 w-6' />,
              color: WARN_COLOR,
              title: t("stats.live.noBridgeTitle"),
              description: t("stats.live.noBridgeDescription"),
            }
          : {
              icon: <Radio className='h-6 w-6' />,
              color: MUTED,
              title: t("stats.live.waitingTitle"),
              description: t("stats.live.waitingDescription"),
            };
  return (
    <div className='flex flex-col gap-4 pb-8'>
      <LiveBanner {...state} />
      {raw.current ? <LivePreview /> : between}
    </div>
  );
};
