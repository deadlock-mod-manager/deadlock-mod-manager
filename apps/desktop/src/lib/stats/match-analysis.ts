import type { DeadlockItem } from "@/lib/deadlock-api";
import type {
  MatchMetadataItem,
  MatchMetadataPlayer,
  MatchMetadataStat,
} from "@/lib/stats/api";
import { statAt } from "@/lib/stats/match-detail";

/**
 * Everything the match page derives from one metadata payload. Stats are sampled
 * every few minutes, so anything "at minute N" is interpolated between samples.
 */

export const lastStat = (
  player: MatchMetadataPlayer,
): MatchMetadataStat | undefined => player.stats[player.stats.length - 1];

/**
 * A sampled series read at `time`: linear between the samples around it, from
 * zero before the first, and held after the last. Samples must be sorted.
 */
export const interpolate = (
  samples: Array<[time: number, value: number]>,
  time: number,
): number => {
  let before: [number, number] = [0, 0];
  for (const sample of samples) {
    if (sample[0] >= time) {
      if (sample[0] === before[0]) return sample[1];
      const t = (time - before[0]) / (sample[0] - before[0]);
      return before[1] + t * (sample[1] - before[1]);
    }
    before = sample;
  }
  return before[1];
};

/** Net worth at `time`, between the stat samples around it. */
export const soulsAt = (stats: MatchMetadataStat[], time: number): number =>
  interpolate(
    stats.map((stat) => [stat.time_stamp_s, stat.net_worth]),
    time,
  );

export interface LeadPoint {
  time: number;
  /** Team 0's souls minus team 1's. */
  lead: number;
}

/** Team souls difference at every sampled moment, starting from an even 0:00. */
export const soulLead = (players: MatchMetadataPlayer[]): LeadPoint[] => {
  const times = [
    ...new Set(
      players.flatMap((player) => player.stats.map((s) => s.time_stamp_s)),
    ),
  ].sort((a, b) => a - b);
  const points = times.map((time) => ({
    time,
    lead: players.reduce((sum, player) => {
      const souls = statAt(player.stats, time)?.net_worth ?? 0;
      return sum + (player.team === 0 ? souls : -souls);
    }, 0),
  }));
  return points[0]?.time === 0 ? points : [{ time: 0, lead: 0 }, ...points];
};

/** A lead smaller than this is noise, not a peak worth naming. */
const MIN_PEAK_LEAD = 1500;
/** A peak on (or right before) the last sample is the final lead, labelled anyway. */
const MIN_PEAK_GAP_S = 240;

export interface LeadStory {
  /** Each team's biggest lead, when it was real and came before the end. */
  peaks: Array<{ team: number; time: number; lead: number }>;
  /** The last moment the lead changed hands, and who took it. */
  swing: { time: number; team: number } | null;
}

/** The moments worth labelling on a soul-lead line. */
export const leadStory = (lead: LeadPoint[]): LeadStory => {
  const end = lead[lead.length - 1];
  if (!end) return { peaks: [], swing: null };

  const peaks = [0, 1].flatMap((team) => {
    const sign = team === 0 ? 1 : -1;
    const best = lead.reduce((top, point) =>
      point.lead * sign > top.lead * sign ? point : top,
    );
    return best.lead * sign >= MIN_PEAK_LEAD &&
      end.time - best.time >= MIN_PEAK_GAP_S
      ? [{ team, time: best.time, lead: best.lead }]
      : [];
  });

  let swing: LeadStory["swing"] = null;
  let previous: LeadPoint | null = null;
  for (const point of lead) {
    if (point.lead === 0) continue;
    if (previous && Math.sign(previous.lead) !== Math.sign(point.lead)) {
      // Where the line crosses zero between the two samples.
      const t = previous.lead / (previous.lead - point.lead);
      swing = {
        time: previous.time + t * (point.time - previous.time),
        team: point.lead > 0 ? 0 : 1,
      };
    }
    previous = point;
  }
  return { peaks, swing };
};

export interface KillEvent {
  /** Slot of the player who died; with `time`, unique per kill. */
  victim: number;
  time: number;
  /** The team that got the kill. */
  team: number;
}

/**
 * Every player kill, read off the victims' deaths so each one counts once.
 * Deaths without an enemy killer (neutrals, falls) are not kills.
 */
export const killTimeline = (players: MatchMetadataPlayer[]): KillEvent[] => {
  const teamOf = new Map(
    players.map((player) => [player.player_slot, player.team]),
  );
  return players
    .flatMap((victim) =>
      victim.death_details.flatMap((death) => {
        const killerTeam =
          death.killer_player_slot === null
            ? undefined
            : teamOf.get(death.killer_player_slot);
        return killerTeam === undefined || killerTeam === victim.team
          ? []
          : [
              {
                victim: victim.player_slot,
                time: death.game_time_s,
                team: killerTeam,
              },
            ];
      }),
    )
    .sort((a, b) => a.time - b.time);
};

const PLACEMENT_METRICS = [
  "damage",
  "souls",
  "accuracy",
  "healing",
  "deaths",
] as const;
export type PlacementMetric = (typeof PLACEMENT_METRICS)[number];

const placementValue = (
  player: MatchMetadataPlayer,
  metric: PlacementMetric,
): number | null => {
  const stat = lastStat(player);
  switch (metric) {
    case "damage":
      return stat?.player_damage ?? null;
    case "souls":
      return player.net_worth;
    case "healing":
      return stat?.player_healing ?? null;
    case "deaths":
      return player.deaths;
    case "accuracy": {
      const shots = (stat?.shots_hit ?? 0) + (stat?.shots_missed ?? 0);
      return shots > 0 ? (stat?.shots_hit ?? 0) / shots : null;
    }
  }
};

export interface Placement {
  metric: PlacementMetric;
  value: number;
  /** 1 is the best in the lobby. */
  rank: number;
  /** Team of each lobby slot, best to worst, for the strip. */
  order: Array<{ slot: number; team: number; isMe: boolean }>;
}

/** Where `me` finished in the lobby on each metric; fewer deaths ranks higher. */
export const lobbyPlacements = (
  players: MatchMetadataPlayer[],
  me: MatchMetadataPlayer,
): Placement[] =>
  PLACEMENT_METRICS.flatMap((metric) => {
    const scored = players.flatMap((player) => {
      const value = placementValue(player, metric);
      return value === null ? [] : [{ player, value }];
    });
    const mine = scored.find((entry) => entry.player === me);
    if (!mine) return [];
    scored.sort((a, b) =>
      metric === "deaths" ? a.value - b.value : b.value - a.value,
    );
    return [
      {
        metric,
        value: mine.value,
        rank: scored.indexOf(mine) + 1,
        order: scored.map((entry) => ({
          slot: entry.player.player_slot,
          team: entry.player.team,
          isMe: entry.player === me,
        })),
      },
    ];
  });

export interface Duel {
  enemy: MatchMetadataPlayer;
  /** Times `me` killed this enemy. */
  kills: number;
  /** Times this enemy killed `me`. */
  deaths: number;
}

export const duels = (
  players: MatchMetadataPlayer[],
  me: MatchMetadataPlayer,
): Duel[] =>
  players
    .filter((player) => player.team !== me.team)
    .map((enemy) => ({
      enemy,
      kills: enemy.death_details.filter(
        (death) => death.killer_player_slot === me.player_slot,
      ).length,
      deaths: me.death_details.filter(
        (death) => death.killer_player_slot === enemy.player_slot,
      ).length,
    }))
    .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths));

/** Laning is over by the first mid-game objectives; 9:00 is the last sample before. */
export const LANE_END_S = 540;

export interface LaneSide {
  team: number;
  players: Array<{ player: MatchMetadataPlayer; souls: number }>;
  souls: number;
}

/** The player's lane, both sides, with souls when laning ended. */
export const laneMatchup = (
  players: MatchMetadataPlayer[],
  me: MatchMetadataPlayer,
): LaneSide[] | null => {
  if (me.assigned_lane === null) return null;
  const laners = players.filter(
    (player) => player.assigned_lane === me.assigned_lane,
  );
  const sides = [me.team, me.team === 0 ? 1 : 0].map((team) => {
    const side = laners
      .filter((player) => player.team === team)
      .map((player) => ({
        player,
        souls: soulsAt(player.stats, LANE_END_S),
      }));
    return {
      team,
      players: side,
      souls: side.reduce((sum, entry) => sum + entry.souls, 0),
    };
  });
  return sides.every((side) => side.players.length > 0) ? sides : null;
};

/** The laner with the most kills on the other pair before laning ended, if 2+. */
export const laneTopKiller = (
  sides: LaneSide[],
): { player: MatchMetadataPlayer; kills: number } | null => {
  const [first, second] = sides;
  if (!first || !second) return null;
  const killsOn = (killer: MatchMetadataPlayer, victims: LaneSide) =>
    victims.players.reduce(
      (sum, { player }) =>
        sum +
        player.death_details.filter(
          (death) =>
            death.killer_player_slot === killer.player_slot &&
            death.game_time_s <= LANE_END_S,
        ).length,
      0,
    );
  const candidates = [
    ...first.players.map(({ player }) => ({
      player,
      kills: killsOn(player, second),
    })),
    ...second.players.map(({ player }) => ({
      player,
      kills: killsOn(player, first),
    })),
  ].sort((a, b) => b.kills - a.kills);
  const top = candidates[0];
  return top && top.kills >= 2 ? top : null;
};

export interface Purchase {
  item: DeadlockItem;
  time: number;
  /** `null` while the item was still held at the end. */
  soldAt: number | null;
}

/** Shop purchases only; metadata lists ability upgrades in the same array. */
export const purchases = (
  entries: MatchMetadataItem[],
  itemsById: Map<number, DeadlockItem>,
): Purchase[] =>
  entries
    .flatMap((entry) => {
      const item = itemsById.get(entry.item_id);
      return item && item.type === "upgrade" && entry.upgrade_id === 1
        ? [
            {
              item,
              time: entry.game_time_s,
              soldAt: entry.sold_time_s > 0 ? entry.sold_time_s : null,
            },
          ]
        : [];
    })
    .sort((a, b) => a.time - b.time);

export const SLOT_TYPES = ["weapon", "vitality", "spirit"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

export const isSlotType = (value: string | undefined): value is SlotType =>
  SLOT_TYPES.some((slot) => slot === value);

/** Souls spent per slot type, counting sold items too: the souls were spent. */
export const spendBySlot = (bought: Purchase[]) => {
  const spend = { weapon: 0, vitality: 0, spirit: 0 };
  for (const { item } of bought) {
    if (isSlotType(item.item_slot_type)) {
      spend[item.item_slot_type] += item.cost ?? 0;
    }
  }
  return spend;
};

/** The first purchase of a tier or higher, the usual "power spike" marker. */
export const firstOfTier = (bought: Purchase[], tier: number) =>
  bought.find((purchase) => (purchase.item.item_tier ?? 0) >= tier) ?? null;
