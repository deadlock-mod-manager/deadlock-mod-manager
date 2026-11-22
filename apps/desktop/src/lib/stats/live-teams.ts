import type { DeadlockHero } from "@/lib/deadlock-api";
import type { LiveScoreboard } from "@/types/generated/LiveScoreboard";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";
import type { Team } from "@/types/generated/Team";

const TEAMS = {
  hiddenKing: { color: "var(--team-0)", name: "stats.live.teams.hiddenKing" },
  archmother: { color: "var(--team-1)", name: "stats.live.teams.archmother" },
} satisfies Record<Team, { color: string; name: string }>;

export const teamColor = (team: Team) => TEAMS[team].color;

export const teamName = (team: Team) => TEAMS[team].name;

export const otherTeam = (team: Team): Team =>
  team === "hiddenKing" ? "archmother" : "hiddenKing";

export interface ResolvedPlayer {
  player: LiveScoreboardPlayer;
  hero: DeadlockHero | undefined;
}

export interface ResolvedBoard {
  team: Team;
  friendly: ResolvedPlayer[];
  enemy: ResolvedPlayer[];
}

export const resolveBoard = (
  board: LiveScoreboard,
  heroFor: (player: LiveScoreboardPlayer) => DeadlockHero | undefined,
): ResolvedBoard => {
  const resolve = (player: LiveScoreboardPlayer) => ({
    player,
    hero: heroFor(player),
  });
  return {
    team: board.team,
    friendly: board.friendly.map(resolve),
    enemy: board.enemy.map(resolve),
  };
};

export const heroIdOf = ({ player, hero }: ResolvedPlayer): number =>
  hero?.id ?? player.heroId ?? 0;

type TeamNumber = "souls" | "kills" | "deaths" | "assists" | "objectiveDamage";

export const teamTotal = (players: ResolvedPlayer[], key: TeamNumber): number =>
  players.reduce((sum, { player }) => sum + (player[key] ?? 0), 0);
