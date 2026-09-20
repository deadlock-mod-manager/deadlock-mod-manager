import { describe, expect, it } from "vitest";
import {
  type DeadlockHero,
  type DeadlockUpgrade,
  ITEM_CATEGORIES,
  type ItemCategory,
  ULTIMATE_SLOT,
} from "@/lib/deadlock-assets";
import {
  ABILITY_SLOTS,
  AP_COSTS,
  rollLoadout,
  SLOTS_PER_CATEGORY,
  SOUL_BUDGET,
} from "./roll";

const TIER_COSTS = [800, 1600, 3200, 6400];
const TIERS = [1, 2, 3, 4];
const ITEMS_PER_TIER = 7;

const makeUpgrade = (
  category: ItemCategory,
  tier: number,
  index: number,
  overrides: Partial<DeadlockUpgrade> = {},
): DeadlockUpgrade => ({
  id: index,
  class_name: `upgrade_${category}_${tier}_${index}`,
  name: `${category} ${tier}-${index}`,
  type: "upgrade",
  item_slot_type: category,
  item_tier: tier,
  cost: TIER_COSTS[tier - 1],
  shopable: true,
  shop_image: "https://example.invalid/item.png",
  description: {},
  ...overrides,
});

const UPGRADES: DeadlockUpgrade[] = ITEM_CATEGORIES.flatMap((category) =>
  TIERS.flatMap((tier) =>
    Array.from({ length: ITEMS_PER_TIER }, (_, index) =>
      makeUpgrade(category, tier, index, {
        // Every tier 3 item is built out of the first tier 1 item of its
        // category, so the roll has real component conflicts to avoid.
        component_items: tier === 3 ? [`upgrade_${category}_1_0`] : undefined,
        imbue:
          tier === 4 && index === 0
            ? "imbue_active_non_ult"
            : tier === 3 && index === 1
              ? "imbue_modifier_value"
              : undefined,
      }),
    ),
  ),
);

/** Every item but the last of each tier, mirroring a real per-hero draft pool. */
const draftBucketing = (
  excluded: Set<string> = new Set(),
): DeadlockHero["item_draft_bucketing"] =>
  Object.fromEntries(
    UPGRADES.filter((item) => !excluded.has(item.class_name)).map((item) => [
      item.class_name,
      { bucket: item.item_tier % 2 === 0 ? "Good" : "Normal", weight: 1 },
    ]),
  );

const makeHero = (
  id: number,
  overrides: Partial<DeadlockHero> = {},
): DeadlockHero => ({
  id,
  class_name: `hero_${id}`,
  name: `Hero ${id}`,
  complexity: 2,
  player_selectable: true,
  disabled: false,
  in_development: false,
  description: {},
  images: {},
  items: {
    signature1: "ability_one",
    signature2: "ability_two",
    signature3: "ability_three",
    signature4: "ability_four",
  },
  item_slot_info: {
    weapon: { max_purchases_for_tier: [6, 6, 6] },
    vitality: { max_purchases_for_tier: [6, 6, 6] },
    spirit: { max_purchases_for_tier: [6, 6, 6] },
  },
  item_draft_bucketing: draftBucketing(),
  colors: {},
  ...overrides,
});

/** Drafts no spirit items at all, and nothing above tier 3. */
const NARROW_POOL = new Set(
  UPGRADES.filter(
    (item) => item.item_slot_type === "spirit" || item.item_tier > 3,
  ).map((item) => item.class_name),
);

const NARROW_HERO = makeHero(99, {
  name: "Narrow",
  item_draft_bucketing: draftBucketing(NARROW_POOL),
});

const CAPPED_HERO = makeHero(98, {
  name: "Capped",
  item_slot_info: {
    weapon: { max_purchases_for_tier: [1, 1, 1] },
    vitality: { max_purchases_for_tier: [2, 2, 0] },
    spirit: { max_purchases_for_tier: [6, 6, 6] },
  },
});

const HEROES = [makeHero(1), makeHero(2), NARROW_HERO, CAPPED_HERO];

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7919 + 13);

describe("rollLoadout", () => {
  it("is fully determined by its seed", () => {
    const first = rollLoadout(4242, HEROES, UPGRADES);
    const second = rollLoadout(4242, HEROES, UPGRADES);

    expect(second.hero.id).toBe(first.hero.id);
    expect(second.build.map((entry) => entry.item.class_name)).toEqual(
      first.build.map((entry) => entry.item.class_name),
    );
    expect(second.abilityOrder).toEqual(first.abilityOrder);
    expect(second.challenges).toEqual(first.challenges);
  });

  it("never buys the same item twice", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      const names = build.map((entry) => entry.item.class_name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("never pairs an item with a component it already contains", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      const names = new Set(build.map((entry) => entry.item.class_name));
      for (const { item } of build) {
        for (const component of item.component_items ?? []) {
          expect(names.has(component)).toBe(false);
        }
      }
    }
  });

  it("only buys items the rolled hero actually drafts", () => {
    for (const seed of SEEDS) {
      const { hero, build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const { item } of build) {
        expect(hero.item_draft_bucketing[item.class_name]).toBeDefined();
      }
    }
  });

  it("keeps a narrow draft pool inside its bounds", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, [NARROW_HERO], UPGRADES);
      expect(build.length).toBeGreaterThan(0);
      for (const { item } of build) {
        expect(item.item_slot_type).not.toBe("spirit");
        expect(item.item_tier).toBeLessThanOrEqual(3);
      }
    }
  });

  it("respects each hero's per-tier purchase limits", () => {
    for (const seed of SEEDS) {
      const { hero, build } = rollLoadout(seed, HEROES, UPGRADES);
      const counts = new Map<string, number>();
      for (const { item } of build) {
        const key = `${item.item_slot_type}:${item.item_tier}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, count] of counts) {
        const [category, tier] = key.split(":");
        const cap =
          hero.item_slot_info[category]?.max_purchases_for_tier?.[
            Number(tier) - 1
          ] ?? SLOTS_PER_CATEGORY;
        expect(count).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("fills at most four slots per category", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const category of ITEM_CATEGORIES) {
        const count = build.filter(
          (entry) => entry.item.item_slot_type === category,
        ).length;
        expect(count).toBeLessThanOrEqual(SLOTS_PER_CATEGORY);
      }
    }
  });

  it("orders the build so tiers only ever go up", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (let index = 1; index < build.length; index++) {
        expect(build[index].item.item_tier).toBeGreaterThanOrEqual(
          build[index - 1].item.item_tier,
        );
      }
    }
  });

  it("imbues only imbuable items, and keeps non-ult imbues off the ultimate", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const { item, imbueSlot } of build) {
        expect(imbueSlot !== undefined).toBe(Boolean(item.imbue));
        if (imbueSlot === undefined) {
          continue;
        }
        expect(imbueSlot).toBeGreaterThanOrEqual(1);
        expect(imbueSlot).toBeLessThanOrEqual(ABILITY_SLOTS);
        if (item.imbue === "imbue_active_non_ult") {
          expect(imbueSlot).not.toBe(ULTIMATE_SLOT);
        }
      }
    }
  });

  it("spends every ability point in a legal order", () => {
    const totalAp =
      ABILITY_SLOTS * AP_COSTS.reduce((sum, cost) => sum + cost, 0);

    for (const seed of SEEDS) {
      const { abilityOrder } = rollLoadout(seed, HEROES, UPGRADES);
      expect(abilityOrder).toHaveLength(ABILITY_SLOTS * AP_COSTS.length);
      expect(abilityOrder.at(-1)?.apSpent).toBe(totalAp);

      const taken = new Map<number, number>();
      let running = 0;
      for (const step of abilityOrder) {
        const previous = taken.get(step.slot) ?? 0;
        expect(step.step).toBe(previous + 1);
        expect(step.apCost).toBe(AP_COSTS[previous]);
        running += step.apCost;
        expect(step.apSpent).toBe(running);
        taken.set(step.slot, step.step);
      }
    }
  });

  it("totals souls across the three categories", () => {
    for (const seed of SEEDS) {
      const { build, totalSouls, soulsByCategory } = rollLoadout(
        seed,
        HEROES,
        UPGRADES,
      );
      const expected = build.reduce(
        (sum, entry) => sum + (entry.item.cost ?? 0),
        0,
      );
      expect(totalSouls).toBe(expected);
      expect(
        ITEM_CATEGORIES.reduce(
          (sum, category) => sum + soulsByCategory[category],
          0,
        ),
      ).toBe(expected);
    }
  });

  it("keeps every build inside a realistic soul budget", () => {
    for (const seed of SEEDS) {
      const { totalSouls } = rollLoadout(seed, HEROES, UPGRADES);
      expect(totalSouls).toBeLessThanOrEqual(SOUL_BUDGET);
    }
  });

  it("only buys items that carry a real price", () => {
    for (const seed of SEEDS) {
      const { build } = rollLoadout(seed, HEROES, UPGRADES);
      for (const { item } of build) {
        expect(item.cost).toBeGreaterThan(0);
        expect(item.cost).not.toBe(9999);
      }
    }
  });

  it("falls back to the whole shop when the draft map matches nothing", () => {
    const strangerHero = makeHero(51, {
      item_draft_bucketing: {
        upgrade_renamed_by_a_patch: { bucket: "Good", weight: 1 },
      },
    });
    const { build, draftPoolSize } = rollLoadout(9, [strangerHero], UPGRADES);

    expect(build).toHaveLength(SLOTS_PER_CATEGORY * ITEM_CATEGORIES.length);
    expect(draftPoolSize).toBe(UPGRADES.length);
  });

  it("falls back to the whole shop when a hero has no draft data", () => {
    const heroWithoutDraft = makeHero(50, { item_draft_bucketing: {} });
    const { build, draftPoolSize } = rollLoadout(
      7,
      [heroWithoutDraft],
      UPGRADES,
    );

    expect(draftPoolSize).toBe(UPGRADES.length);
    expect(build.length).toBeGreaterThan(0);
  });
});
