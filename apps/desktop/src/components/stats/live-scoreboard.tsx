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
  Clock,
  Download,
  FileWarning,
  Loader2,
  Puzzle,
  Radio,
  Skull,
} from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { LivePerformance } from "@/components/stats/live-performance";
import { LivePregame } from "@/components/stats/live-pregame";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import { useGameRunning } from "@/hooks/use-mod-health";
import {
  type LiveScoreboardPlayer,
  useLiveMatchDetection,
} from "@/hooks/use-live-match";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type PlayerRank,
  type RankAsset,
  rankLabel,
  resolveRank,
} from "@/lib/stats/api";
import type { HeroPerformance, StatsSummary } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import type { StatsScope } from "@/lib/stats/scope";
import { cn } from "@/lib/utils";

/** What the page already knows about the selected account, shown on its row. */
interface LiveScoreboardYou {
  rank: PlayerRank | null;
  career: StatsSummary;
  heroes: HeroPerformance[];
}

interface LiveScoreboardProps {
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  scope: StatsScope;
  you: LiveScoreboardYou;
}

/** The game's states between joining a match and the zipline. */
const PREGAME_STATES = new Set([
  "WaitingForPlayersToJoin",
  "HeroSelection",
  "MatchIntro",
  "WaitForMapToLoad",
  "PreGameWait",
]);
const IN_PROGRESS_STATE = "GameInProgress";

/** The game's team numbers; anything else has no name to show. */
const teamStyle = (team: number) => {
  if (team === 2) {
    return { name: "stats.live.teams.hiddenKing", accent: "bg-amber-500" };
  }
  if (team === 3) {
    return { name: "stats.live.teams.archmother", accent: "bg-sky-500" };
  }
  return null;
};

const bySouls = (a: LiveScoreboardPlayer, b: LiveScoreboardPlayer) =>
  (b.souls ?? 0) - (a.souls ?? 0);

const sum = (
  players: LiveScoreboardPlayer[],
  valueOf: (player: LiveScoreboardPlayer) => number | null,
) => players.reduce((total, player) => total + (valueOf(player) ?? 0), 0);

const orDash = (value: number | null) => (value === null ? "–" : value);

/** The bridge repeats an unchanged board every 20 seconds, so this is overdue. */
const BRIDGE_STALE_MS = 45_000;

/**
 * Whether the bridge reported recently. Bot and practice matches log no lobby
 * line, so this is what tells them apart from a finished match. Console log
 * timestamps are local time without a year (`MM/DD HH:MM:SS`).
 */
const isRecentReport = (updatedAt: string | null, now: number): boolean => {
  const parts = updatedAt?.match(/^(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)$/);
  if (!parts) return false;
  const [, month, day, hours, minutes, seconds] = parts.map(Number);
  const reported = new Date(
    new Date(now).getFullYear(),
    month - 1,
    day,
    hours,
    minutes,
    seconds,
  );
  // A report from late December read on January 1st belongs to last year.
  if (reported.getTime() - now > 24 * 60 * 60 * 1000) {
    reported.setFullYear(reported.getFullYear() - 1);
  }
  return now - reported.getTime() < BRIDGE_STALE_MS;
};

/**
 * The running match as the in-game top bar shows it. Everything comes from the
 * console log: the live bridge HUD mod prints the scoreboard there, so no API
 * is asked to spectate anything.
 */
export const LiveScoreboard = ({
  heroesById,
  rankAssets,
  scope,
  you,
}: LiveScoreboardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const live = useLiveMatchDetection(true);
  const bridge = useLiveBridge();
  const gameRunning = useGameRunning();
  const raw = live.data;
  // console.log outlives the game, so with Deadlock closed nothing in it is
  // current. Only a lobby line marks a real match; the hideout runs the same
  // top bar without one.
  const inMatch = gameRunning && !!raw?.current;
  const gameState = inMatch ? (raw?.gameState ?? null) : null;
  const isPregame =
    inMatch && (gameState === null || PREGAME_STATES.has(gameState));
  const isInProgress = inMatch && gameState === IN_PROGRESS_STATE;
  // In the match the bridge reports throughout, so a quiet board is from a
  // session that never wrote the log. Before it, the top bar may not exist yet.
  const liveBoard =
    raw?.scoreboard &&
    (isPregame ||
      (isInProgress && isRecentReport(raw.scoreboard.updatedAt, Date.now())))
      ? raw.scoreboard
      : null;
  const status = raw && {
    ...raw,
    current: inMatch ? raw.current : null,
    queued: gameRunning && raw.queued,
    scoreboard: liveBoard,
  };
  const board = status?.scoreboard ?? null;

  // The top bar has no readable hero id, only the hero's display name, which
  // matches the catalog's English names.
  const heroesByName = useMemo(
    () =>
      new Map(
        [...heroesById.values()].map((hero) => [hero.name.toLowerCase(), hero]),
      ),
    [heroesById],
  );
  const heroFor = (player: LiveScoreboardPlayer) =>
    (player.heroId === null ? undefined : heroesById.get(player.heroId)) ??
    (player.heroName === null
      ? undefined
      : heroesByName.get(player.heroName.toLowerCase()));

  // Sorted once per poll rather than in the render body; the board re-renders
  // every couple of seconds while a match runs.
  // Only the player's own team is shown; the other side stays off the board.
  const teams = useMemo(
    () =>
      board
        ? [
            {
              key: "friendly",
              style: teamStyle(board.friendlyTeam),
              players: [...board.friendly].sort(bySouls),
            },
          ]
        : [],
    [board],
  );

  if (!status) {
    return (
      <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t("stats.live.checking")}
      </div>
    );
  }

  // console.log only exists with -condebug, and everything here is read from it.
  if (!status.consoleLogAvailable) {
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

  if (!board) {
    // Without the bridge nothing here can ever fill in, so that comes first.
    // With it, a match without a board means the game was started before the
    // bridge was installed, or the top bar has not appeared yet.
    const state = bridge.needsSetup
      ? bridge.inLibrary
        ? {
            Icon: Puzzle,
            title: t("stats.live.bridge.disabledTitle"),
            description: t("stats.live.bridge.disabledDescription"),
          }
        : {
            Icon: Puzzle,
            title: t("stats.live.bridge.notInstalledTitle"),
            description: t("stats.live.bridge.notInstalledDescription"),
          }
      : !gameRunning
        ? {
            Icon: Radio,
            title: t("stats.live.notRunningTitle"),
            description: t("stats.live.notRunningDescription"),
          }
        : status.current && isPregame
          ? {
              Icon: Loader2,
              title: t("stats.live.pregame.loadingTitle"),
              description: t("stats.live.pregame.loadingDescription"),
            }
          : status.current && !isInProgress
            ? {
                Icon: Radio,
                title: t("stats.live.matchOverTitle"),
                description: t("stats.live.matchOverDescription"),
              }
            : status.current
              ? {
                  Icon: Puzzle,
                  title: t("stats.live.noBridgeTitle"),
                  description: t("stats.live.noBridgeDescription"),
                }
              : status.queued
                ? {
                    Icon: Radio,
                    title: t("stats.live.queuedTitle"),
                    description: t("stats.live.queuedDescription"),
                  }
                : {
                    Icon: Radio,
                    title: t("stats.live.waitingTitle"),
                    description: t("stats.live.waitingDescription"),
                  };
    return (
      <Empty className='py-16'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <state.Icon className='h-16 w-16' />
          </EmptyMedia>
          <EmptyTitle>{state.title}</EmptyTitle>
          <EmptyDescription>{state.description}</EmptyDescription>
        </EmptyHeader>
        {bridge.needsSetup && (
          <EmptyContent>
            <Button
              disabled={bridge.install.isPending}
              onClick={() => bridge.install.mutate()}>
              {bridge.install.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Download className='h-4 w-4' />
              )}
              {bridge.install.isPending
                ? t("stats.live.bridge.installing")
                : bridge.inLibrary
                  ? t("stats.live.bridge.enable")
                  : t("stats.live.bridge.install")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  // The bridge sees names only, so career numbers exist for the selected
  // account's own row and nobody else's.
  const renderYouLine = (hero: DeadlockHero | undefined) => {
    if (you.career.matches === 0) return null;
    const onHero = hero
      ? you.heroes.find((entry) => entry.heroId === hero.id)
      : undefined;
    return (
      <div className='truncate text-muted-foreground text-xs tabular-nums'>
        {t("stats.live.career", {
          matches: you.career.matches,
          winrate: formatPercent(you.career.winrate, 0),
          kda: formatDecimal(you.career.kda, 1),
        })}
        {onHero &&
          ` · ${t("stats.live.onHero", {
            matches: onHero.matches,
            hero: hero?.name,
            winrate: formatPercent(onHero.winrate, 0),
          })}`}
      </div>
    );
  };

  const yourRank = you.rank ? resolveRank(you.rank.badge, rankAssets) : null;
  const yourRankLabel = you.rank ? rankLabel(you.rank.badge, rankAssets) : null;

  const renderPlayer = (player: LiveScoreboardPlayer, index: number) => {
    const hero = heroFor(player);
    return (
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_2.5rem_4rem] items-center gap-2 rounded-lg border p-2 text-sm",
          player.isLocal && "border-primary",
          player.isDead && "opacity-60",
        )}
        // The top bar lists each player once per team; names can repeat.
        key={`${player.name}-${index}`}>
        <div className='flex min-w-0 items-center gap-2'>
          <HeroAvatar
            className='h-8 w-8 shrink-0'
            hero={hero}
            heroId={hero?.id ?? player.heroId ?? 0}
          />
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <span className='truncate font-medium'>{player.name}</span>
              {player.isLocal && (
                <Badge className='shrink-0' variant='secondary'>
                  {t("stats.live.you")}
                </Badge>
              )}
              {player.isLocal && yourRank?.image && (
                <img
                  alt={yourRankLabel ?? ""}
                  className='h-5 w-5 shrink-0 object-contain'
                  src={yourRank.image}
                  title={yourRankLabel ?? undefined}
                />
              )}
              {player.isDead && (
                <Skull
                  aria-label={t("stats.live.dead")}
                  className='h-3.5 w-3.5 shrink-0 text-muted-foreground'
                />
              )}
            </div>
            <div className='truncate text-muted-foreground text-xs'>
              {player.heroName ?? hero?.name}
            </div>
            {player.isLocal && renderYouLine(hero)}
          </div>
        </div>
        <span className='text-right tabular-nums'>
          {orDash(player.kills)}/{orDash(player.deaths)}/
          {orDash(player.assists)}
        </span>
        <span className='text-right tabular-nums'>
          {player.souls === null ? "–" : formatCompact(player.souls)}
        </span>
        <span className='text-right tabular-nums'>{orDash(player.level)}</span>
        <span className='text-right tabular-nums'>
          {player.objectiveDamage === null
            ? "–"
            : formatCompact(player.objectiveDamage)}
        </span>
      </div>
    );
  };

  if (isPregame) {
    return (
      <LivePregame
        board={board}
        enemyStyle={
          board.friendlyTeam === 0
            ? null
            : teamStyle(board.friendlyTeam === 2 ? 3 : 2)
        }
        friendlyStyle={teamStyle(board.friendlyTeam)}
        heroFor={heroFor}
      />
    );
  }

  const localPlayer = board.friendly.find((player) => player.isLocal);

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge className='gap-1.5' variant='secondary'>
          <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-500' />
          {t("stats.live.live")}
        </Badge>
        {board.clock && (
          <Badge className='gap-1.5 tabular-nums' variant='outline'>
            <Clock className='h-3 w-3' />
            {board.clock}
          </Badge>
        )}
        {status.queued && (
          <Badge variant='outline'>{t("stats.live.queuedBadge")}</Badge>
        )}
        {status.current && (
          <span className='text-muted-foreground text-xs'>
            {t("stats.live.matchId", { id: status.current.matchId })}
          </span>
        )}
        {board.updatedAt && (
          <span className='ml-auto text-muted-foreground text-xs'>
            {t("stats.live.updatedAt", { time: board.updatedAt })}
          </span>
        )}
      </div>

      <div className='grid items-start gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]'>
        {localPlayer ? (
          <LivePerformance
            badge={you.rank?.badge}
            clock={board.clock}
            hero={heroFor(localPlayer)}
            player={localPlayer}
            rankAssets={rankAssets}
            scope={scope}
          />
        ) : (
          <Card className='p-3 text-center text-muted-foreground text-sm shadow-none'>
            {t("stats.live.performance.spectating")}
          </Card>
        )}
        <div className='flex flex-col gap-4'>
          {teams.map((team) => (
            <Card
              className='flex flex-col gap-2 p-3 shadow-none'
              key={team.key}>
              <div className='flex items-center justify-between'>
                <span className='flex items-center gap-2 font-semibold text-sm'>
                  {team.style && (
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        team.style.accent,
                      )}
                    />
                  )}
                  {team.style ? t(team.style.name) : t("stats.live.friendly")}
                  {team.style && (
                    <Badge variant='outline'>{t("stats.live.friendly")}</Badge>
                  )}
                </span>
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {t("stats.live.teamTotals", {
                    count: sum(team.players, (player) => player.kills),
                    souls: formatCompact(
                      sum(team.players, (player) => player.souls),
                    ),
                  })}
                </span>
              </div>
              <div className='grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_2.5rem_4rem] gap-2 px-2 text-muted-foreground text-xs'>
                <span>{t("stats.live.columns.player")}</span>
                <span className='text-right'>
                  {t("stats.live.columns.kda")}
                </span>
                <span className='text-right'>
                  {t("stats.live.columns.souls")}
                </span>
                <span className='text-right'>
                  {t("stats.live.columns.level")}
                </span>
                <span className='text-right'>
                  {t("stats.live.columns.objectiveDamage")}
                </span>
              </div>
              {team.players.length === 0 ? (
                <span className='py-4 text-center text-muted-foreground text-sm'>
                  {t("stats.live.teamPending")}
                </span>
              ) : (
                team.players.map(renderPlayer)
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
