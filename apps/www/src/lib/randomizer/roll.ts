import {
  type DeadlockHero,
  type DeadlockUpgrade,
  ITEM_CATEGORIES,
  type ItemCategory,
  ULTIMATE_SLOT,
} from "@/lib/deadlock-assets";
import { type Challenge, CHALLENGES } from "./challenges";
import { createRng, pick, type Rng, shuffle, weightedPick } from "./rng";

export const SLOTS_PER_CATEGORY = 4;
export const ABILITY_SLOTS = 4;
export const AP_COSTS = [1, 2, 5] as const;

/**
 * Plausible tier ramps for one category. A real build starts cheap and ends on
 * one or two expensive items, so the roll picks a shape instead of four
 * independent tiers - otherwise half the rolls open on an item nobody can
 * afford before the game is over.
 */
const TIER_SHAPES: readonly (readonly number[])[] = [
  [1, 1, 2, 2],
  [1, 1, 2, 3],
  [1, 2, 2, 3],
  [1, 1, 2, 4],
  [1, 2, 3, 3],
  [1, 2, 3, 4],
  [2, 2, 3, 4],
  [1, 1, 3, 4],
  [1, 2, 2, 4],
  [2, 3, 3, 4],
];

/**
 * What a full build is allowed to cost. A long Deadlock match leaves a player
 * somewhere north of thirty thousand souls, and a roll nobody can finish
 * buying is not a roll worth playing - so the build is capped rather than left
 * to whatever the tier shapes add up to.
 */
export const SOUL_BUDGET = 34_000;

/** How much likelier a hero's "Good" draft items are than its ordinary ones. */
const GOOD_BUCKET_WEIGHT = 3;
const LANES = ["Solo Lane", "Duo Lane"] as const;
const CHALLENGE_COUNT = 3;

export interface Mandate {
  label: string;
  blurb: string;
}

const MANDATES: Record<ItemCategory, Mandate> = {
  weapon: {
    label: "Gunslinger",
    blurb:
      "Most of your souls went into the gun. Win your trades with it before anyone has armour.",
  },
  spirit: {
    label: "Caster",
    blurb:
      "The roll is built around your abilities. Hold the cooldowns for the fight that matters.",
  },
  vitality: {
    label: "Bulwark",
    blurb:
      "You bought survivability first. Be the one who walks into the lane and does not leave.",
  },
};

export interface RolledItem {
  item: DeadlockUpgrade;
  /** 1-based signature ability this item is imbued onto, when it is an imbue. */
  imbueSlot?: number;
  /** True when this hero's draft data rates the item highly. */
  recommended: boolean;
}

export interface AbilityStep {
  /** 1-based signature slot, matching `hero.items.signature{n}`. */
  slot: number;
  /** 1, 2 or 3 - which of the ability's three upgrades this point buys. */
  step: number;
  apCost: number;
  apSpent: number;
}

export interface Roll {
  seed: number;
  hero: DeadlockHero;
  lane: string;
  mandate: Mandate;
  build: RolledItem[];
  abilityOrder: AbilityStep[];
  challenges: Challenge[];
  totalSouls: number;
  soulsByCategory: Record<ItemCategory, number>;
  /** How many shop items this hero actually drafts, of everything buyable. */
  draftPoolSize: number;
}

const costOf = (item: DeadlockUpgrade) => item.cost ?? 0;

/** Imbue items that may not go on the ultimate, per the item's own flag. */
const isUltimateSafe = (item: DeadlockUpgrade): boolean =>
  item.imbue !== "imbue_active_non_ult";

const tierCap = (hero: DeadlockHero, category: ItemCategory, tier: number) =>
  hero.item_slot_info[category]?.max_purchases_for_tier?.[tier - 1] ??
  SLOTS_PER_CATEGORY;

/**
 * Tiers to try for a wanted tier, nearest first. Keeps a roll from dead-ending
 * when a hero's draft pool has nothing left at the tier the shape asked for.
 */
const tierFallbacks = (wanted: number, maxTier: number): number[] => {
  const tiers: number[] = [];
  for (let distance = 0; distance < maxTier; distance++) {
    for (const tier of [wanted - distance, wanted + distance]) {
      if (tier >= 1 && tier <= maxTier && !tiers.includes(tier)) {
        tiers.push(tier);
      }
    }
  }
  return tiers;
};

const rollBuild = (
  rng: Rng,
  hero: DeadlockHero,
  upgrades: DeadlockUpgrade[],
): RolledItem[] => {
  const draft = hero.item_draft_bucketing;
  // Heroes carry their own draft pool, so the shop is not the same for all of
  // them. The whole shop stands in when a hero has no draft data, and equally
  // when its data matches nothing we can buy - renamed class names after a
  // patch would otherwise leave the build empty.
  const drafted = upgrades.filter(
    (item) => draft[item.class_name] !== undefined,
  );
  const draftable = drafted.length > 0 ? drafted : upgrades;
  const maxTier = draftable.reduce((max, u) => Math.max(max, u.item_tier), 1);
  const blocked = new Set<string>();

  /**
   * An item and anything it shares a component tree with are one purchase. The
   * shop already folds the component into the upgrade, so rolling both would
   * waste a slot on something the player already owns.
   */
  const block = (item: DeadlockUpgrade) => {
    blocked.add(item.class_name);
    for (const component of item.component_items ?? []) {
      blocked.add(component);
    }
    for (const other of draftable) {
      if ((other.component_items ?? []).includes(item.class_name)) {
        blocked.add(other.class_name);
      }
    }
  };

  const weightOf = (item: DeadlockUpgrade) => {
    const entry = draft[item.class_name];
    if (!entry) {
      return 1;
    }
    return entry.weight * (entry.bucket === "Good" ? GOOD_BUCKET_WEIGHT : 1);
  };

  const cheapestCost = draftable.reduce(
    (min, item) => Math.min(min, costOf(item)),
    Number.POSITIVE_INFINITY,
  );

  const picked: RolledItem[] = [];
  let soulsLeft = SOUL_BUDGET;
  let picksLeft = ITEM_CATEGORIES.length * SLOTS_PER_CATEGORY;

  // Whichever category is filled last takes whatever the budget has left, so
  // the order is shuffled rather than always squeezing the same one.
  for (const category of shuffle(rng, ITEM_CATEGORIES)) {
    const pool = draftable.filter((item) => item.item_slot_type === category);
    const takenPerTier = new Map<number, number>();
    const shape = pick(rng, TIER_SHAPES);

    for (const wantedTier of shape.slice(0, SLOTS_PER_CATEGORY)) {
      // Whatever this slot costs, the slots after it still have to fit in the
      // budget, so each pick reserves the cheapest possible item for each one.
      const reserved = (picksLeft - 1) * cheapestCost;

      for (const tier of tierFallbacks(wantedTier, maxTier)) {
        if ((takenPerTier.get(tier) ?? 0) >= tierCap(hero, category, tier)) {
          continue;
        }
        const candidates = pool.filter(
          (item) =>
            item.item_tier === tier &&
            !blocked.has(item.class_name) &&
            costOf(item) <= soulsLeft - reserved,
        );
        if (candidates.length === 0) {
          continue;
        }
        const item = weightedPick(rng, candidates, weightOf);
        block(item);
        takenPerTier.set(tier, (takenPerTier.get(tier) ?? 0) + 1);
        soulsLeft -= costOf(item);
        picksLeft -= 1;

        const imbueSlots = isUltimateSafe(item)
          ? ABILITY_SLOTS
          : ULTIMATE_SLOT - 1;
        picked.push({
          item,
          imbueSlot: item.imbue
            ? Math.floor(rng() * imbueSlots) + 1
            : undefined,
          recommended: draft[item.class_name]?.bucket === "Good",
        });
        break;
      }
    }
  }

  const orderKeys = new Map(
    picked.map((entry) => [entry.item.class_name, rng()]),
  );
  return [...picked].sort((a, b) => {
    if (a.item.item_tier !== b.item.item_tier) {
      return a.item.item_tier - b.item.item_tier;
    }
    return (
      (orderKeys.get(a.item.class_name) ?? 0) -
      (orderKeys.get(b.item.class_name) ?? 0)
    );
  });
};

const rollAbilityOrder = (rng: Rng): AbilityStep[] => {
  const progress = Array.from({ length: ABILITY_SLOTS }, (_, index) => ({
    slot: index + 1,
    taken: 0,
  }));
  const steps: AbilityStep[] = [];
  let apSpent = 0;

  while (progress.some((entry) => entry.taken < AP_COSTS.length)) {
    const open = progress.filter((entry) => entry.taken < AP_COSTS.length);
    // Cheap upgrades are far likelier to come first, the way points actually
    // get spent - without ever locking out a greedy 5 point opener.
    const chosen = weightedPick(
      rng,
      open,
      (entry) => 1 / AP_COSTS[entry.taken],
    );
    const apCost = AP_COSTS[chosen.taken];
    apSpent += apCost;
    steps.push({
      slot: chosen.slot,
      step: chosen.taken + 1,
      apCost,
      apSpent,
    });
    chosen.taken += 1;
  }

  return steps;
};

const soulsByCategory = (build: RolledItem[]): Record<ItemCategory, number> => {
  const totals: Record<ItemCategory, number> = {
    weapon: 0,
    vitality: 0,
    spirit: 0,
  };
  for (const { item } of build) {
    totals[item.item_slot_type] += item.cost ?? 0;
  }
  return totals;
};

export const rollLoadout = (
  seed: number,
  heroes: DeadlockHero[],
  upgrades: DeadlockUpgrade[],
): Roll => {
  const rng = createRng(seed);
  const hero = pick(rng, heroes);
  const lane = pick(rng, LANES);
  const build = rollBuild(rng, hero, upgrades);
  const abilityOrder = rollAbilityOrder(rng);
  const challenges = shuffle(rng, CHALLENGES).slice(0, CHALLENGE_COUNT);
  const souls = soulsByCategory(build);
  const dominant = ITEM_CATEGORIES.reduce((best, category) =>
    souls[category] > souls[best] ? category : best,
  );
  const draftPoolSize = upgrades.filter(
    (item) => hero.item_draft_bucketing[item.class_name] !== undefined,
  ).length;

  return {
    seed,
    hero,
    lane,
    mandate: MANDATES[dominant],
    build,
    abilityOrder,
    challenges,
    totalSouls: Object.values(souls).reduce((sum, value) => sum + value, 0),
    soulsByCategory: souls,
    draftPoolSize: draftPoolSize || upgrades.length,
  };
};
