import { describe, expect, it } from "bun:test";
import type { MatchMetadataPlayer, MatchMetadataStat } from "@/lib/stats/api";
import {
  duels,
  killTimeline,
  leadStory,
  lobbyPlacements,
  soulLead,
  soulsAt,
} from "@/lib/stats/match-analysis";

const stat = (time: number, netWorth: number): MatchMetadataStat => ({
  time_stamp_s: time,
  net_worth: netWorth,
  kills: 0,
  deaths: 0,
  assists: 0,
  player_damage: 0,
  player_damage_taken: 0,
  player_healing: 0,
  damage_mitigated: 0,
  boss_damage: 0,
  shots_hit: 0,
  shots_missed: 0,
});

const player = (
  overrides: Partial<MatchMetadataPlayer> &
    Pick<MatchMetadataPlayer, "player_slot" | "team">,
): MatchMetadataPlayer => ({
  account_id: overrides.player_slot,
  hero_id: 1,
  kills: 0,
  deaths: 0,
  assists: 0,
  net_worth: 0,
  last_hits: 0,
  denies: 0,
  level: 1,
  items: [],
  stats: [],
  death_details: [],
  mvp_rank: null,
  assigned_lane: null,
  ...overrides,
});

describe("soulsAt", () => {
  it("interpolates between samples and holds the last one", () => {
    const stats = [stat(180, 1000), stat(360, 2000)];
    expect(soulsAt(stats, 270)).toBe(1500);
    expect(soulsAt(stats, 90)).toBe(500);
    expect(soulsAt(stats, 900)).toBe(2000);
  });
});

describe("soulLead", () => {
  it("is team 0 minus team 1, from an even start", () => {
    const lead = soulLead([
      player({ player_slot: 1, team: 0, stats: [stat(180, 3000)] }),
      player({ player_slot: 2, team: 1, stats: [stat(180, 2000)] }),
    ]);
    expect(lead).toEqual([
      { time: 0, lead: 0 },
      { time: 180, lead: 1000 },
    ]);
  });
});

describe("leadStory", () => {
  it("names both teams' peaks and the last time the lead changed hands", () => {
    const story = leadStory([
      { time: 0, lead: 0 },
      { time: 300, lead: -2000 },
      { time: 600, lead: 500 },
      { time: 900, lead: 6000 },
      { time: 1200, lead: 4000 },
    ]);
    expect(story.peaks).toEqual([
      { team: 0, time: 900, lead: 6000 },
      { team: 1, time: 300, lead: -2000 },
    ]);
    expect(story.swing).toEqual({ time: 300 + 300 * 0.8, team: 0 });
  });

  it("leaves a peak on the final sample to the end label", () => {
    expect(
      leadStory([
        { time: 0, lead: 0 },
        { time: 600, lead: 3000 },
      ]).peaks,
    ).toEqual([]);
  });
});

describe("kills and duels", () => {
  const me = player({
    player_slot: 1,
    team: 0,
    death_details: [{ game_time_s: 300, killer_player_slot: 7 }],
  });
  const enemy = player({
    player_slot: 7,
    team: 1,
    death_details: [
      { game_time_s: 120, killer_player_slot: 1 },
      { game_time_s: 600, killer_player_slot: 2 },
    ],
  });
  const ally = player({ player_slot: 2, team: 0 });

  it("credits each death to the killer's team, skipping non-player deaths", () => {
    const fell = player({
      player_slot: 3,
      team: 0,
      death_details: [{ game_time_s: 700, killer_player_slot: null }],
    });
    expect(killTimeline([me, enemy, ally, fell])).toEqual([
      { victim: 7, time: 120, team: 0 },
      { victim: 1, time: 300, team: 1 },
      { victim: 7, time: 600, team: 0 },
    ]);
  });

  it("counts only the kills between the two players", () => {
    expect(duels([me, enemy, ally], me)).toEqual([
      { enemy, kills: 1, deaths: 1 },
    ]);
  });
});

describe("lobbyPlacements", () => {
  it("ranks fewer deaths as better", () => {
    const me = player({ player_slot: 1, team: 0, deaths: 2 });
    const placements = lobbyPlacements(
      [
        me,
        player({ player_slot: 2, team: 1, deaths: 5 }),
        player({ player_slot: 3, team: 1, deaths: 1 }),
      ],
      me,
    );
    expect(placements.find((p) => p.metric === "deaths")?.rank).toBe(2);
  });
});
