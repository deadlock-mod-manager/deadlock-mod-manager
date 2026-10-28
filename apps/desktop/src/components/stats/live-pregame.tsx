import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card } from "@deadlock-mods/ui/components/card";
import { Loader2 } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type {
  LiveRosterPlayer,
  LiveScoreboard,
  LiveScoreboardPlayer,
} from "@/hooks/use-live-match";
import { useLobbyCareers } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatDecimal, formatPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

interface TeamStyle {
  name: string;
  accent: string;
}

interface LivePregameProps {
  board: LiveScoreboard;
  heroFor: (player: LiveScoreboardPlayer) => DeadlockHero | undefined;
  friendlyStyle: TeamStyle | null;
  enemyStyle: TeamStyle | null;
}

/** A top-bar player, or a versus-screen entry before the top bar exists. */
interface LobbyPlayer {
  key: string;
  name: string;
  isLocal: boolean;
  hero: DeadlockHero | undefined;
  heroName: string | null;
  accountId: number | null;
}

/**
 * Everyone in the lobby before the zipline: both teams, with each player's
 * overall record. Records need the account behind a name, which only the
 * versus screen provides, so players it did not list show none.
 */
export const LivePregame = ({
  board,
  heroFor,
  friendlyStyle,
  enemyStyle,
}: LivePregameProps) => {
  const { t } = useTranslation();

  const accountsByName = useMemo(
    () =>
      new Map(
        board.roster
          .filter(
            (entry): entry is LiveRosterPlayer & { accountId: number } =>
              entry.accountId !== null,
          )
          .map((entry) => [entry.name, entry.accountId]),
      ),
    [board.roster],
  );
  const { careers, isPending } = useLobbyCareers([...accountsByName.values()]);

  const toLobby = (players: LiveScoreboardPlayer[]): LobbyPlayer[] =>
    players.map((player, index) => ({
      key: `${player.name}-${index}`,
      name: player.name,
      isLocal: player.isLocal,
      hero: heroFor(player),
      heroName: player.heroName,
      accountId: accountsByName.get(player.name) ?? null,
    }));

  const teams = [
    {
      key: "friendly",
      style: friendlyStyle,
      isYours: true,
      players: toLobby(board.friendly),
    },
    {
      key: "enemy",
      style: enemyStyle,
      isYours: false,
      players: toLobby(board.enemy),
    },
  ];

  const renderPlayer = (player: LobbyPlayer) => {
    const career =
      player.accountId === null ? undefined : careers.get(player.accountId);
    return (
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_4rem_4rem_4.5rem] items-center gap-2 rounded-lg border p-2 text-sm",
          player.isLocal && "border-primary",
        )}
        key={player.key}>
        <div className='flex min-w-0 items-center gap-2'>
          <HeroAvatar
            className='h-8 w-8 shrink-0'
            hero={player.hero}
            heroId={player.hero?.id ?? 0}
          />
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <span className='truncate font-medium'>{player.name}</span>
              {player.isLocal && (
                <Badge className='shrink-0' variant='secondary'>
                  {t("stats.live.you")}
                </Badge>
              )}
            </div>
            <div className='truncate text-muted-foreground text-xs'>
              {player.heroName ?? player.hero?.name}
            </div>
          </div>
        </div>
        {career ? (
          <>
            <span className='text-right tabular-nums'>
              {formatDecimal(career.kda, 1)}
            </span>
            <span className='text-right tabular-nums'>
              {formatPercent(career.winrate, 0)}
            </span>
            <span className='text-right text-muted-foreground tabular-nums'>
              {career.matches}
            </span>
          </>
        ) : (
          <span className='col-span-3 text-right text-muted-foreground text-xs'>
            {player.accountId !== null && isPending ? (
              <Loader2 className='ml-auto h-3.5 w-3.5 animate-spin' />
            ) : (
              t("stats.live.pregame.noRecord")
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge className='gap-1.5' variant='secondary'>
          <span className='h-2 w-2 animate-pulse rounded-full bg-amber-500' />
          {t("stats.live.pregame.badge")}
        </Badge>
        <span className='text-muted-foreground text-xs'>
          {t("stats.live.pregame.hint")}
        </span>
      </div>
      <div className='grid gap-4 xl:grid-cols-2'>
        {teams.map((team) => (
          <Card className='flex flex-col gap-2 p-3 shadow-none' key={team.key}>
            <span className='flex items-center gap-2 font-semibold text-sm'>
              {team.style && (
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", team.style.accent)}
                />
              )}
              {team.style
                ? t(team.style.name)
                : team.isYours
                  ? t("stats.live.friendly")
                  : t("stats.live.pregame.enemy")}
              {team.isYours && team.style && (
                <Badge variant='outline'>{t("stats.live.friendly")}</Badge>
              )}
            </span>
            <div className='grid grid-cols-[minmax(0,1fr)_4rem_4rem_4.5rem] gap-2 px-2 text-muted-foreground text-xs'>
              <span>{t("stats.live.columns.player")}</span>
              <span className='text-right'>
                {t("stats.live.pregame.avgKda")}
              </span>
              <span className='text-right'>
                {t("stats.live.pregame.winrate")}
              </span>
              <span className='text-right'>
                {t("stats.live.pregame.matches")}
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
  );
};
