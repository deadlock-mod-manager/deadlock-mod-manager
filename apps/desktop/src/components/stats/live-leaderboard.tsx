import { Card } from "@deadlock-mods/ui/components/card";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { useReorderSafeSelect } from "@/hooks/use-reorder-safe-select";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { SteamProfile } from "@/lib/stats/api";
import { formatCompact } from "@/lib/stats/format";
import { type LivePlayer, SAPPHIRE_TEAM } from "@/lib/stats/live";
import { cn } from "@/lib/utils";

interface LiveLeaderboardProps {
  players: LivePlayer[];
  profiles: Map<number, SteamProfile>;
  heroesById: Map<number, DeadlockHero>;
  ownAccountId: number | null;
  onSelect: (player: LivePlayer) => void;
}

interface BoardProps extends Omit<LiveLeaderboardProps, "players"> {
  title: string;
  ranked: LivePlayer[];
  valueOf: (player: LivePlayer) => number;
  format: (value: number) => string;
}

const Board = ({
  title,
  ranked,
  valueOf,
  format,
  profiles,
  heroesById,
  ownAccountId,
  onSelect,
}: BoardProps) => {
  const leader = Math.max(valueOf(ranked[0]) || 0, 1);
  // These rows swap places as souls and kills come in, so a press has to be
  // tied to the row it started on rather than to whatever ends up under the
  // cursor a moment later.
  const { containerProps, itemProps } = useReorderSafeSelect(onSelect);

  return (
    <Card className='flex flex-col gap-1 p-3 shadow-none' {...containerProps}>
      <span className='mb-1 font-semibold text-sm'>{title}</span>
      {ranked.map((player, index) => {
        const value = valueOf(player);
        const isSelf = player.accountId === ownAccountId;
        return (
          <button
            className={cn(
              "relative flex items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
              isSelf && "bg-accent/60",
            )}
            key={player.steamId64}
            type='button'
            {...itemProps(player)}>
            {/* Bar behind the row: share of the current leader's value. */}
            <span
              aria-hidden
              className='absolute inset-y-0 left-0 rounded-md opacity-15'
              style={{
                width: `${(value / leader) * 100}%`,
                backgroundColor:
                  player.team === SAPPHIRE_TEAM
                    ? "var(--viz-series-1)"
                    : "var(--viz-series-2)",
              }}
            />
            <span
              className={cn(
                "relative w-4 text-xs tabular-nums",
                index === 0
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}>
              {index + 1}
            </span>
            <HeroAvatar
              className='relative h-6 w-6'
              hero={heroesById.get(player.heroId)}
              heroId={player.heroId}
            />
            <span className='relative min-w-0 flex-1 truncate text-sm'>
              {profiles.get(player.accountId)?.personaname ??
                `#${player.accountId}`}
            </span>
            <span className='relative font-medium text-sm tabular-nums'>
              {format(value)}
            </span>
          </button>
        );
      })}
    </Card>
  );
};

const byNetWorth = (player: LivePlayer) => player.netWorth;
const byKills = (player: LivePlayer) => player.kills;

/** Who is ahead right now, across both teams rather than within one. */
export const LiveLeaderboard = memo(
  ({ players, ...rest }: LiveLeaderboardProps) => {
    const { t } = useTranslation();

    // Sorted off the roster rather than in the render body: the surrounding view
    // re-renders on things the ranking does not depend on, and both orders are a
    // fresh copy plus a sort of the whole lobby.
    const bySouls = useMemo(
      () => [...players].sort((a, b) => b.netWorth - a.netWorth),
      [players],
    );
    const byFrags = useMemo(
      () =>
        [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
      [players],
    );

    if (players.length === 0) {
      return null;
    }

    return (
      <div className='grid gap-4 lg:grid-cols-2'>
        <Board
          format={formatCompact}
          ranked={bySouls}
          title={t("stats.live.mostSouls")}
          valueOf={byNetWorth}
          {...rest}
        />
        <Board
          format={String}
          ranked={byFrags}
          title={t("stats.live.mostKills")}
          valueOf={byKills}
          {...rest}
        />
      </div>
    );
  },
);
