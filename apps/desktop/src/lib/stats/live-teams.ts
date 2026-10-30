import type { DeadlockHero } from "@/lib/deadlock-api";
import type { LiveScoreboard } from "@/types/generated/LiveScoreboard";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";
import type { Team } from "@/types/generated/Team";

const TEAMS = {
  hiddenKing: { color: "var(--team-0)", name: "stats.live.teams.hiddenKing" },
  archmother: { color: "var(--team-1)", name: "stats.live.teams.archmother" },
} satisfies Record<Team, { color: string; name: string }>;

export const teamColor = (team: Team) => TEAMS[team].color;

/** The i18n key of the team's name. */
export const teamName = (team: Team) => TEAMS[team].name;

export const otherTeam = (team: Team): Team =>
  team === "hiddenKing" ? "archmother" : "hiddenKing";

/** A top bar player with the hero they are on, when it could be matched. */
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

/** The id to show for a player's portrait, even when the hero list missed it. */
export const heroIdOf = ({ player, hero }: ResolvedPlayer): number =>
  hero?.id ?? player.heroId ?? 0;

type TeamNumber = "souls" | "kills" | "deaths" | "assists" | "objectiveDamage";

/** A team's total, counting what the top bar could not read as zero. */
export const teamTotal = (players: ResolvedPlayer[], key: TeamNumber): number =>
  players.reduce((sum, { player }) => sum + (player[key] ?? 0), 0);
