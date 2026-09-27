import {
  type DeadlockAbility,
  type DeadlockHero,
  type DeadlockUpgrade,
  heroSlug,
  ITEM_CATEGORIES,
  type ItemCategory,
  isChargedAbility,
  ULTIMATE_SLOT,
} from "@/lib/deadlock-assets";
import { type Challenge, CHALLENGES } from "./challenges";
import { createRng, pick, type Rng, shuffle, weightedPick } from "./rng";

export const SLOTS_PER_CATEGORY = 4;
export const ABILITY_SLOTS = 4;
export const AP_COSTS = [1, 2, 5] as const;

/**
 * Plausible tier ramps for one category, in the tier each slot ends up at. A
 * real build starts cheap and grows into the late game, so every shape ends on
 * at least one tier 4 item - matches run long, and a build that tops out at
 * tier 3 has nothing left to buy by the time they do.
 */
const TIER_SHAPES: readonly (readonly number[])[] = [
  [1, 2, 3, 4],
  [1, 2, 4, 4],
  [1, 3, 3, 4],
  [1, 3, 4, 4],
  [2, 2, 3, 4],
  [2, 3, 3, 4],
  [2, 3, 4, 4],
  [1, 2, 2, 4],
  [2, 2, 4, 4],
  [1, 1, 3, 4],
];

/**
 * What a full build is allowed to cost. A long Deadlock match leaves a player
 * somewhere in the forties of thousands of souls, and a roll nobody can
 * finish buying is not a roll worth playing - so the build is capped rather
 * than left to whatever the tier shapes add up to.
 */
export const SOUL_BUDGET = 46_000;

/** How much likelier a hero's "Good" draft items are than its ordinary ones. */
const GOOD_BUCKET_WEIGHT = 3;
/** How often a rolled item that has an upgrade gets taken all the way. */
const UPGRADE_CHANCE = 0.5;
/**
 * The map has three lanes and every one of them is a duo lane, so the lane
 * itself is all there is to roll.
 */
const LANES = ["Yellow Lane", "Blue Lane", "Green Lane"] as const;
const CHALLENGE_COUNT = 3;

/**
 * Items that only work on abilities with charges. Every hero's draft data
 * lists them, charged ability or not, so they are checked against the kit.
 */
export const CHARGE_ITEMS: ReadonlySet<string> = new Set([
  "upgrade_extra_charge",
  "upgrade_rapid_recharge",
  "upgrade_rechargingbullets",
]);

/**
 * The first point each unlock can take, in unlock order. Stands in for a hero
 * that comes without a level table.
 */
const DEFAULT_UNLOCK_GATES = [1, 2, 3, 5];

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
  /** What goes into the slot first. */
  item: DeadlockUpgrade;
  /**
   * What the item is later upgraded into, in the same slot. The shop deducts
   * the component's cost, so the slot ends up costing the upgrade's price.
   */
  upgrade?: DeadlockUpgrade;
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

/**
 * One step of levelling an ability, in the order they happen in a match. Every
 * ability goes through four: the unlock, then its three upgrades.
 */
export type SkillStep =
  | { kind: "unlock"; slot: number }
  | ({ kind: "upgrade" } & AbilityStep);

export interface Roll {
  seed: number;
  hero: DeadlockHero;
  lane: string;
  mandate: Mandate;
  build: RolledItem[];
  /** Signature slots in the order they get unlocked. The ultimate is last. */
  unlockOrder: number[];
  abilityOrder: AbilityStep[];
  /** Unlocks and upgrades together, four per ability, as the match hands them out. */
  skillOrder: SkillStep[];
  challenges: Challenge[];
  totalSouls: number;
  soulsByCategory: Record<ItemCategory, number>;
  /** How many shop items this hero actually drafts, of everything buyable. */
  draftPoolSize: number;
}

export interface RollOptions {
  /** Slug of the hero to lock the roll to. An unknown slug rolls as usual. */
  heroSlug?: string;
  /**
   * Every ability by class name. Without it the roll cannot tell which heroes
   * have charged abilities, and leaves the charge items in every pool.
   */
  abilities?: ReadonlyMap<string, DeadlockAbility>;
}

const costOf = (item: DeadlockUpgrade) => item.cost ?? 0;

/** The item a slot ends up holding once its upgrade is bought. */
export const finalItem = (entry: RolledItem): DeadlockUpgrade =>
  entry.upgrade ?? entry.item;

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

/**
 * Whether the hero has anything for Extra Charge and friends to work on. An
 * ability that is missing from the data counts as charged: leaving a charge
 * item in the pool is a smaller mistake than taking it from a hero who needs
 * it.
 */
const hasChargedAbility = (
  hero: DeadlockHero,
  abilities: ReadonlyMap<string, DeadlockAbility> | undefined,
): boolean => {
  if (!abilities) {
    return true;
  }
  return Array.from({ length: ABILITY_SLOTS }, (_, index) =>
    abilities.get(hero.items[`signature${index + 1}`] ?? ""),
  ).some((ability) => !ability || isChargedAbility(ability));
};

const rollBuild = (
  rng: Rng,
  hero: DeadlockHero,
  upgrades: DeadlockUpgrade[],
  charged: boolean,
): RolledItem[] => {
  const draft = hero.item_draft_bucketing;
  const usable = charged
    ? upgrades
    : upgrades.filter((item) => !CHARGE_ITEMS.has(item.class_name));
  // Heroes carry their own draft pool, so the shop is not the same for all of
  // them. The whole shop stands in when a hero has no draft data, and equally
  // when its data matches nothing we can buy - renamed class names after a
  // patch would otherwise leave the build empty.
  const drafted = usable.filter((item) => draft[item.class_name] !== undefined);
  const draftable = drafted.length > 0 ? drafted : usable;
  const maxTier = draftable.reduce((max, u) => Math.max(max, u.item_tier), 1);
  const blocked = new Set<string>();

  /**
   * An item and anything it shares a component tree with belong in one slot.
   * The shop folds the component into the upgrade, so putting both into
   * separate slots would pay twice for something the player already owns.
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
    const hasRoom = (item: DeadlockUpgrade) =>
      (takenPerTier.get(item.item_tier) ?? 0) <
      tierCap(hero, category, item.item_tier);
    const shape = pick(rng, TIER_SHAPES);

    for (const wantedTier of shape.slice(0, SLOTS_PER_CATEGORY)) {
      // Whatever this slot costs, the slots after it still have to fit in the
      // budget, so each pick reserves the cheapest possible item for each one.
      const reserved = (picksLeft - 1) * cheapestCost;
      const affordable = (item: DeadlockUpgrade) =>
        costOf(item) <= soulsLeft - reserved;

      for (const tier of tierFallbacks(wantedTier, maxTier)) {
        if ((takenPerTier.get(tier) ?? 0) >= tierCap(hero, category, tier)) {
          continue;
        }
        const candidates = pool.filter(
          (item) =>
            item.item_tier === tier &&
            !blocked.has(item.class_name) &&
            affordable(item),
        );
        if (candidates.length === 0) {
          continue;
        }
        const target = weightedPick(rng, candidates, weightOf);
        let item = target;
        let upgrade: DeadlockUpgrade | undefined;

        // An item built out of a component is shown as the way to it: the
        // component first, then the upgrade into the rolled item.
        const components = draftable.filter(
          (other) =>
            (target.component_items ?? []).includes(other.class_name) &&
            !blocked.has(other.class_name),
        );
        if (components.length > 0) {
          item = weightedPick(rng, components, weightOf);
          upgrade = target;
        } else {
          // A plain item with an upgrade gets taken all the way some of the
          // time, as long as the upgrade still fits the budget and tier limits.
          const upgradesTo = draftable.filter(
            (other) =>
              (other.component_items ?? []).includes(target.class_name) &&
              !blocked.has(other.class_name) &&
              affordable(other) &&
              hasRoom(other),
          );
          if (upgradesTo.length > 0 && rng() < UPGRADE_CHANCE) {
            upgrade = weightedPick(rng, upgradesTo, weightOf);
          }
        }

        const final = upgrade ?? item;
        block(item);
        if (upgrade) {
          block(upgrade);
        }
        takenPerTier.set(
          final.item_tier,
          (takenPerTier.get(final.item_tier) ?? 0) + 1,
        );
        soulsLeft -= costOf(final);
        picksLeft -= 1;

        const imbued = [item, upgrade].some((entry) => entry?.imbue);
        const imbueSlots =
          isUltimateSafe(item) && (!upgrade || isUltimateSafe(upgrade))
            ? ABILITY_SLOTS
            : ULTIMATE_SLOT - 1;
        picked.push({
          item,
          upgrade,
          imbueSlot: imbued ? Math.floor(rng() * imbueSlots) + 1 : undefined,
          recommended: draft[final.class_name]?.bucket === "Good",
        });
        break;
      }
    }
  }

  // Slots are listed by what they end up as, so the list climbs from cheap to
  // expensive: an upgrade path is bought where its final item belongs, and the
  // late game is where the big items land.
  const orderKeys = new Map(
    picked.map((entry) => [entry.item.class_name, rng()]),
  );
  return [...picked].sort((a, b) => {
    const tierA = finalItem(a).item_tier;
    const tierB = finalItem(b).item_tier;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    return (
      (orderKeys.get(a.item.class_name) ?? 0) -
      (orderKeys.get(b.item.class_name) ?? 0)
    );
  });
};

/**
 * The first point each unlock can take, read off the hero's level table. An
 * ability unlocked once `n` points are already earned cannot have received
 * any of them, so point `n + 1` is its earliest.
 */
export const unlockGates = (hero: DeadlockHero): number[] => {
  const levels = Object.entries(hero.level_info)
    .map(([level, info]) => ({ level: Number(level), info }))
    .filter(({ level }) => Number.isFinite(level))
    .sort((a, b) => a.level - b.level);
  const gates: number[] = [];
  let points = 0;
  for (const { info } of levels) {
    if (info.bonus_currencies.includes("EAbilityUnlocks")) {
      gates.push(points + 1);
    }
    if (info.bonus_currencies.includes("EAbilityPoints")) {
      points += 1;
    }
  }
  return gates.length >= ABILITY_SLOTS
    ? gates.slice(0, ABILITY_SLOTS)
    : DEFAULT_UNLOCK_GATES;
};

/** The three signatures unlock in any order; the ultimate is always last. */
const rollUnlockOrder = (rng: Rng): number[] => [
  ...shuffle(
    rng,
    Array.from({ length: ABILITY_SLOTS - 1 }, (_, index) => index + 1),
  ),
  ULTIMATE_SLOT,
];

const rollAbilityOrder = (
  rng: Rng,
  unlockOrder: number[],
  gates: number[],
): AbilityStep[] => {
  const progress = Array.from({ length: ABILITY_SLOTS }, (_, index) => ({
    slot: index + 1,
    taken: 0,
    gate: gates[unlockOrder.indexOf(index + 1)] ?? 1,
  }));
  const steps: AbilityStep[] = [];
  let apSpent = 0;

  while (progress.some((entry) => entry.taken < AP_COSTS.length)) {
    // No points go into an ability before it is unlocked. The first unlock
    // is open from the first point on, so there is always something to buy.
    const open = progress.filter(
      (entry) =>
        entry.taken < AP_COSTS.length &&
        entry.gate <= apSpent + AP_COSTS[entry.taken],
    );
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

/**
 * Weaves the unlocks in between the point upgrades. An unlock arrives once
 * `gate - 1` points are earned, and a point upgrade the moment its running
 * total is - on a tie the upgrade came first, a level earlier.
 */
const skillOrder = (
  unlockOrder: number[],
  gates: number[],
  abilityOrder: AbilityStep[],
): SkillStep[] => {
  const unlocks = unlockOrder.map((slot, index) => ({
    at: (gates[index] ?? 1) - 1,
    step: { kind: "unlock", slot } satisfies SkillStep,
  }));
  const upgrades = abilityOrder.map((step) => ({
    at: step.apSpent,
    step: { kind: "upgrade", ...step } satisfies SkillStep,
  }));
  const steps: SkillStep[] = [];
  let next = 0;
  for (const upgrade of upgrades) {
    while (next < unlocks.length && unlocks[next].at < upgrade.at) {
      steps.push(unlocks[next].step);
      next += 1;
    }
    steps.push(upgrade.step);
  }
  for (const unlock of unlocks.slice(next)) {
    steps.push(unlock.step);
  }
  return steps;
};

const soulsByCategory = (build: RolledItem[]): Record<ItemCategory, number> => {
  const totals: Record<ItemCategory, number> = {
    weapon: 0,
    vitality: 0,
    spirit: 0,
  };
  for (const entry of build) {
    const item = finalItem(entry);
    totals[item.item_slot_type] += costOf(item);
  }
  return totals;
};

export const rollLoadout = (
  seed: number,
  heroes: DeadlockHero[],
  upgrades: DeadlockUpgrade[],
  options: RollOptions = {},
): Roll => {
  const rng = createRng(seed);
  // The hero is drawn even when one is locked, so the rest of the roll spends
  // the random stream the same way either way.
  const drawn = pick(rng, heroes);
  const hero =
    heroes.find((candidate) => heroSlug(candidate) === options.heroSlug) ??
    drawn;
  const lane = pick(rng, LANES);
  const charged = hasChargedAbility(hero, options.abilities);
  const build = rollBuild(rng, hero, upgrades, charged);
  const unlockOrder = rollUnlockOrder(rng);
  const gates = unlockGates(hero);
  const abilityOrder = rollAbilityOrder(rng, unlockOrder, gates);
  const challenges = shuffle(rng, CHALLENGES).slice(0, CHALLENGE_COUNT);
  const souls = soulsByCategory(build);
  const dominant = ITEM_CATEGORIES.reduce((best, category) =>
    souls[category] > souls[best] ? category : best,
  );
  const draftPoolSize = upgrades.filter(
    (item) =>
      hero.item_draft_bucketing[item.class_name] !== undefined &&
      (charged || !CHARGE_ITEMS.has(item.class_name)),
  ).length;

  return {
    seed,
    hero,
    lane,
    mandate: MANDATES[dominant],
    build,
    unlockOrder,
    abilityOrder,
    skillOrder: skillOrder(unlockOrder, gates, abilityOrder),
    challenges,
    totalSouls: Object.values(souls).reduce((sum, value) => sum + value, 0),
    soulsByCategory: souls,
    draftPoolSize: draftPoolSize || upgrades.length,
  };
};
