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

export const SOUL_BUDGET = 46_000;

const GOOD_BUCKET_WEIGHT = 3;
const UPGRADE_CHANCE = 0.5;
const LANES = ["yellow", "blue", "green"] as const;

type Lane = (typeof LANES)[number];
const CHALLENGE_COUNT = 3;

export const CHARGE_ITEMS: ReadonlySet<string> = new Set([
  "upgrade_extra_charge",
  "upgrade_rapid_recharge",
  "upgrade_rechargingbullets",
]);

const DEFAULT_UNLOCK_GATES = [1, 2, 3, 5];

type Mandate = "gunslinger" | "caster" | "bulwark";

const MANDATES: Record<ItemCategory, Mandate> = {
  weapon: "gunslinger",
  spirit: "caster",
  vitality: "bulwark",
};

export interface RolledItem {
  item: DeadlockUpgrade;
  upgrade?: DeadlockUpgrade;
  imbueSlot?: number;
  recommended: boolean;
}

interface AbilityStep {
  slot: number;
  step: number;
  apCost: number;
  apSpent: number;
}

export type SkillStep =
  | { kind: "unlock"; slot: number }
  | ({ kind: "upgrade" } & AbilityStep);

export interface Roll {
  seed: number;
  hero: DeadlockHero;
  lane: Lane;
  mandate: Mandate;
  build: RolledItem[];
  unlockOrder: number[];
  abilityOrder: AbilityStep[];
  skillOrder: SkillStep[];
  challenges: Challenge[];
  totalSouls: number;
  soulsByCategory: Record<ItemCategory, number>;
  draftPoolSize: number;
}

export interface RollOptions {
  heroSlug?: string;
  abilities?: ReadonlyMap<string, DeadlockAbility>;
}

const costOf = (item: DeadlockUpgrade) => item.cost ?? 0;

export const finalItem = (entry: RolledItem): DeadlockUpgrade =>
  entry.upgrade ?? entry.item;

const isUltimateSafe = (item: DeadlockUpgrade): boolean =>
  item.imbue !== "imbue_active_non_ult";

const tierCap = (hero: DeadlockHero, category: ItemCategory, tier: number) =>
  hero.item_slot_info[category]?.max_purchases_for_tier?.[tier - 1] ??
  SLOTS_PER_CATEGORY;

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
  const drafted = usable.filter((item) => draft[item.class_name] !== undefined);
  const draftable = drafted.length > 0 ? drafted : usable;
  const maxTier = draftable.reduce((max, u) => Math.max(max, u.item_tier), 1);
  const blocked = new Set<string>();

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

  for (const category of shuffle(rng, ITEM_CATEGORIES)) {
    const pool = draftable.filter((item) => item.item_slot_type === category);
    const takenPerTier = new Map<number, number>();
    const hasRoom = (item: DeadlockUpgrade) =>
      (takenPerTier.get(item.item_tier) ?? 0) <
      tierCap(hero, category, item.item_tier);
    const shape = pick(rng, TIER_SHAPES);

    for (const wantedTier of shape.slice(0, SLOTS_PER_CATEGORY)) {
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

        const components = draftable.filter(
          (other) =>
            (target.component_items ?? []).includes(other.class_name) &&
            !blocked.has(other.class_name),
        );
        if (components.length > 0) {
          item = weightedPick(rng, components, weightOf);
          upgrade = target;
        } else {
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
    const open = progress.filter(
      (entry) =>
        entry.taken < AP_COSTS.length &&
        entry.gate <= apSpent + AP_COSTS[entry.taken],
    );
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
