import { Card } from "@deadlock-mods/ui/components/card";
import {
  Crown,
  Handshake,
  Swords,
  TrendingDown,
  TrendingUp,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  NOTE_CLASS,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { TeamLabel, teamColor } from "@/components/stats/match/item-tile";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type EnemyStats,
  type MatchMetadata,
  type MateStats,
  type RankAsset,
  resolveRank,
} from "@/lib/stats/api";
import { formatClock, formatThousands } from "@/lib/stats/format";
import type { Duel, LaneSide } from "@/lib/stats/match-analysis";
import { LANE_END_S, laneTopKiller } from "@/lib/stats/match-analysis";
import { cn } from "@/lib/utils";

type Names = (accountId: number) => string;

const PlayerLine = ({
  heroId,
  hero,
  name,
  sub,
  highlight = false,
}: {
  heroId: number;
  hero: DeadlockHero | undefined;
  name: string;
  sub: string;
  highlight?: boolean;
}) => (
  <div className='flex min-w-0 items-center gap-2.5'>
    <HeroAvatar
      className={cn("h-[30px] w-[30px]", HERO_TILE_CLASS)}
      hero={hero}
      heroId={heroId}
    />
    <div className='flex min-w-0 flex-col'>
      <span
        className={cn(
          "truncate font-medium text-[12.5px]",
          highlight && "text-primary",
        )}>
        {name}
      </span>
      <span className='truncate font-mono text-[11px] text-muted-foreground/80'>
        {sub}
      </span>
    </div>
  </div>
);

/** The lane both pairs played, with souls when laning ended and who came out ahead. */
export const LanePanel = ({
  sides,
  meId,
  heroesById,
  nameOf,
}: {
  sides: LaneSide[];
  meId: number;
  heroesById: Map<number, DeadlockHero>;
  nameOf: Names;
}) => {
  const { t } = useTranslation();
  const [mine, theirs] = sides;
  if (!mine || !theirs) return null;
  const total = mine.souls + theirs.souls;
  const diff = mine.souls - theirs.souls;
  const won = diff >= 0;

  const topKiller = laneTopKiller(sides);

  const renderSide = (side: LaneSide) => (
    <div className='flex min-w-0 flex-1 flex-col gap-3'>
      <span className='flex items-center gap-1.5 font-medium text-[11.5px] text-muted-foreground'>
        <span
          className='h-2 w-2 rounded-[2px]'
          style={{ backgroundColor: teamColor(side.team) }}
        />
        {t(`stats.match.teams.${side.team}`)}
      </span>
      {side.players.map(({ player, souls }) => (
        <PlayerLine
          hero={heroesById.get(player.hero_id)}
          heroId={player.hero_id}
          highlight={player.account_id === meId}
          key={player.account_id}
          name={nameOf(player.account_id)}
          sub={formatThousands(souls)}
        />
      ))}
      <span className='mt-1 font-bold font-mono text-[22px] leading-none'>
        {formatThousands(side.souls)}
      </span>
    </div>
  );

  return (
    <ChartCard
      description={t("stats.match.laneDescription", {
        time: formatClock(LANE_END_S),
      })}
      title={t("stats.match.lane")}>
      <div className='flex flex-col gap-5 pt-1'>
        <div className='flex items-stretch gap-3'>
          {renderSide(mine)}
          <span className='flex w-8 shrink-0 items-center justify-center pb-6 font-medium text-muted-foreground text-xs'>
            {t("stats.match.versus")}
          </span>
          {renderSide(theirs)}
        </div>
        <div
          aria-hidden
          className='flex h-2 gap-0.5 overflow-hidden rounded-full'>
          <div
            style={{
              width: `${total > 0 ? (mine.souls / total) * 100 : 50}%`,
              backgroundColor: teamColor(mine.team),
            }}
          />
          <div
            className='flex-1'
            style={{ backgroundColor: teamColor(theirs.team) }}
          />
        </div>
        <p className={NOTE_CLASS}>
          {won ? (
            <TrendingUp
              aria-hidden
              className='h-3.5 w-3.5 shrink-0'
              style={{ color: WIN_COLOR }}
            />
          ) : (
            <TrendingDown
              aria-hidden
              className='h-3.5 w-3.5 shrink-0'
              style={{ color: LOSS_COLOR }}
            />
          )}
          <span>
            {t(won ? "stats.match.laneWon" : "stats.match.laneLost", {
              souls: formatThousands(Math.abs(diff)),
            })}
            {topKiller &&
              ` ${t("stats.match.laneKiller", {
                name: nameOf(topKiller.player.account_id),
                count: topKiller.kills,
                time: formatClock(LANE_END_S),
              })}`}
          </span>
        </p>
      </div>
    </ChartCard>
  );
};

const DUEL_UNIT_PX = 36;

/** Kills traded with each enemy, as a two-sided bar around who got the better of it. */
export const DuelsPanel = ({
  duels,
  heroesById,
  nameOf,
}: {
  duels: Duel[];
  heroesById: Map<number, DeadlockHero>;
  nameOf: Names;
}) => {
  const { t } = useTranslation();
  return (
    <ChartCard
      description={t("stats.match.duelsDescription")}
      title={t("stats.match.duels")}>
      <div className='flex h-full flex-col gap-2.5'>
        {duels.map(({ enemy, kills, deaths }) => {
          const verdict =
            kills > deaths
              ? "won"
              : kills < deaths
                ? "lost"
                : kills > 0
                  ? "even"
                  : "none";
          return (
            <div className='flex items-center gap-3' key={enemy.account_id}>
              <div className='w-40 shrink-0'>
                <PlayerLine
                  hero={heroesById.get(enemy.hero_id)}
                  heroId={enemy.hero_id}
                  name={nameOf(enemy.account_id)}
                  sub={
                    heroesById.get(enemy.hero_id)?.name ?? `#${enemy.hero_id}`
                  }
                />
              </div>
              <div className='flex flex-1 items-center'>
                <div className='flex flex-1 items-center justify-end gap-1.5'>
                  <span className='font-mono font-semibold text-[11.5px]'>
                    {kills}
                  </span>
                  <span
                    className='h-2.5 rounded-l-[3px]'
                    style={{
                      width: Math.max(2, kills * DUEL_UNIT_PX),
                      backgroundColor: kills
                        ? "hsl(var(--primary))"
                        : tint("hsl(var(--foreground))", 10),
                    }}
                  />
                </div>
                <span className='h-4 w-px bg-foreground/20' />
                <div className='flex flex-1 items-center gap-1.5'>
                  <span
                    className='h-2.5 rounded-r-[3px]'
                    style={{
                      width: Math.max(2, deaths * DUEL_UNIT_PX),
                      backgroundColor: deaths
                        ? LOSS_COLOR
                        : tint("hsl(var(--foreground))", 10),
                    }}
                  />
                  <span className='font-mono font-semibold text-[11.5px]'>
                    {deaths}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  "w-20 shrink-0 text-right font-medium text-[11px]",
                  verdict === "none" && "text-muted-foreground/70",
                  verdict === "even" && "text-muted-foreground",
                )}
                style={{
                  color:
                    verdict === "won"
                      ? WIN_COLOR
                      : verdict === "lost"
                        ? LOSS_COLOR
                        : undefined,
                }}>
                {t(`stats.match.duel.${verdict}`)}
              </span>
            </div>
          );
        })}
        <div className='mt-auto flex pr-[92px] pl-[172px] font-mono text-[10px] text-muted-foreground/70'>
          <span className='flex-1 text-right'>
            {t("stats.match.youKilled")}
          </span>
          <span className='w-4' />
          <span className='flex-1'>{t("stats.match.theyKilled")}</span>
        </div>
      </div>
    </ChartCard>
  );
};

interface LobbyRosterProps {
  match: MatchMetadata["match_info"];
  meId: number;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  nameOf: Names;
  mates: Map<number, MateStats>;
  party: Set<number>;
  enemies: Map<number, EnemyStats>;
  onSelectPlayer: (accountId: number) => void;
}

/** Everyone in the match: MVP placing, the team's average rank, and shared history. */
export const LobbyRoster = ({
  match,
  meId,
  heroesById,
  rankAssets,
  nameOf,
  mates,
  party,
  enemies,
  onSelectPlayer,
}: LobbyRosterProps) => {
  const { t } = useTranslation();

  const history = (accountId: number) => {
    if (party.has(accountId)) {
      return { icon: Handshake, text: t("stats.match.history.party") };
    }
    const mate = mates.get(accountId);
    if (mate) {
      return {
        icon: Handshake,
        text: t("stats.match.history.mate", {
          count: mate.matches_played,
          wins: mate.wins,
        }),
      };
    }
    const enemy = enemies.get(accountId);
    if (enemy) {
      return {
        icon: Swords,
        text: t("stats.match.history.enemy", {
          count: enemy.matches_played,
          wins: enemy.wins,
        }),
      };
    }
    return null;
  };

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      {([0, 1] as const).map((team) => {
        const won = match.winning_team === team;
        const badge =
          team === 0 ? match.average_badge_team0 : match.average_badge_team1;
        const rank = badge ? resolveRank(badge, rankAssets) : null;
        const members = match.players.filter((player) => player.team === team);
        return (
          <Card
            className='stats-surface overflow-hidden shadow-none'
            key={team}>
            <div
              className='flex items-center justify-between gap-3 border-border/60 border-b px-5 py-3.5'
              style={{ backgroundColor: tint(teamColor(team), 6) }}>
              <TeamLabel team={team} won={won} />
              {rank?.name && (
                <span className='flex items-center gap-2 text-[11.5px] text-muted-foreground'>
                  {t("stats.match.averageRank")}
                  {rank.image && (
                    <img
                      alt=''
                      className='h-5 w-6 object-contain'
                      src={rank.image}
                    />
                  )}
                  <span className='font-semibold text-foreground'>
                    {rank.subrank > 0
                      ? `${rank.name} ${rank.subrank}`
                      : rank.name}
                  </span>
                </span>
              )}
            </div>
            {members.map((player) => {
              const isMe = player.account_id === meId;
              const hero = heroesById.get(player.hero_id);
              const shared = isMe ? null : history(player.account_id);
              const mvp = player.mvp_rank;
              return (
                <button
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 border-border/50 border-t px-5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
                    isMe && "bg-primary/[0.05]",
                  )}
                  key={player.account_id}
                  onClick={() => onSelectPlayer(player.account_id)}
                  type='button'>
                  <HeroAvatar
                    className={cn(
                      "h-[38px] w-[38px]",
                      HERO_TILE_CLASS,
                      isMe && "ring-[1.5px] ring-primary/60",
                    )}
                    hero={hero}
                    heroId={player.hero_id}
                  />
                  <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <span className='flex items-center gap-1.5'>
                      <span className='truncate font-medium text-[13px]'>
                        {nameOf(player.account_id)}
                      </span>
                      {isMe && (
                        <span className='rounded-full bg-primary px-1.5 font-bold text-[10px] text-primary-foreground'>
                          {t("stats.match.you")}
                        </span>
                      )}
                    </span>
                    <span className='flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground'>
                      {hero?.name ?? `#${player.hero_id}`}
                      {shared && (
                        <span className='flex min-w-0 items-center gap-1 text-foreground/70'>
                          <shared.icon
                            aria-hidden
                            className='h-3 w-3 shrink-0'
                          />
                          <span className='truncate'>{shared.text}</span>
                        </span>
                      )}
                    </span>
                  </div>
                  {mvp !== null && (
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono font-semibold text-[11px]",
                        mvp === 1
                          ? "border border-primary/35 bg-primary/15 text-primary"
                          : mvp <= 3
                            ? "bg-primary/10 text-primary"
                            : "bg-foreground/5 text-muted-foreground",
                      )}>
                      {mvp === 1 && <Crown aria-hidden className='h-3 w-3' />}
                      {t("stats.match.mvp", { rank: mvp })}
                    </span>
                  )}
                </button>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
};
